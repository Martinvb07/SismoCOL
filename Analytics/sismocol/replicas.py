"""Pronóstico de réplicas con Omori-Utsu / Reasenberg-Jones (fase 2 de la analítica).

Modelo de Reasenberg y Jones (1989, Science 243:1173-1176): la tasa de réplicas
de magnitud ≥ M a t días del sismo principal de magnitud Mm es

    λ(t, M) = 10^(a + b·(Mm − M)) · (t + c)^(−p)

- p y c (Omori-Utsu) y la productividad K = 10^(a + b·(Mm − Mc)) se estiman por
  máxima verosimilitud con los tiempos de las réplicas ≥ Mc (Ogata 1983): K tiene
  solución cerrada dados (c, p) y la verosimilitud se maximiza sobre (c, p).
- b se estima con Aki-Utsu sobre la secuencia si hay suficientes réplicas; si no,
  se usa el valor genérico.
- Con pocas réplicas (entre MIN_REPLICAS_A y MIN_REPLICAS_AJUSTE) se usan b, p y c
  genéricos y solo la productividad `a` se estima con el número de réplicas
  observadas (a específico de la secuencia, como en Reasenberg y Jones 1994).
- Sin réplicas suficientes se usan los parámetros genéricos de Reasenberg y Jones
  (1989) para California: a = −1,67, b = 0,91, p = 1,08, c = 0,05 días. No hay
  valores genéricos publicados para Colombia: es una limitación documentada (D15).

Las réplicas son los sismos dentro de la ventana de Gardner-Knopoff del principal.
Para M ≥ 6 la ventana espacial supera 50 km, así que aquí sí se usan los sismos con
centroide municipal (a diferencia de la depuración de D13).

Las probabilidades salen de Poisson: P(≥1) = 1 − exp(−N). El intervalo del 95 %
del número de réplicas combina la incertidumbre de los parámetros (simulación
desde la covarianza asintótica del MLE y el error de b) con la variabilidad de
Poisson. Esto no predice la fecha ni el lugar de un sismo: es un pronóstico
probabilístico que se valida con backtesting.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from scipy import optimize, stats
from sqlalchemy import insert, select

from sismocol import db, sismologia
from sismocol.geo import haversine_km

log = logging.getLogger("sismocol.replicas")

# Parámetros genéricos de Reasenberg y Jones (1989), California.
GENERICO = {"a": -1.67, "b": 0.91, "p": 1.08, "c": 0.05}
MIN_REPLICAS_AJUSTE = 10   # menos réplicas ≥ Mc: b, p y c genéricos
MIN_REPLICAS_A = 3         # menos réplicas ≥ Mc: también a genérico
MIN_REPLICAS_B = 30        # menos réplicas ≥ Mc: b genérico
MIN_EVENTOS_MC = 20        # menos eventos en la secuencia: Mc de respaldo
MC_RESPALDO = 4.0
MAGNITUDES = (4, 5, 6)
HORIZONTES_DIAS = {"24h": 1.0, "7d": 7.0, "30d": 30.0}
VENTANAS_VALIDACION_HORAS = (24, 72, 168)
N_SIMULACIONES = 4000
SEMILLA = 42
LIMITES_C = (1e-4, 5.0)
LIMITES_P = (0.3, 2.5)
PUNTOS_CURVA = 60
DIAS_PRECURSOR = 1.0  # un sismo menor hasta 1 día antes de uno mayor cercano es su precursor


class SinPrincipal(LookupError):
    pass


class MagnitudInsuficiente(ValueError):
    pass


MAGNITUD_MIN_CONSULTA = 4.0      # pronóstico al vuelo para cualquier sismo del registro
SEGUNDOS_PARA_CACHE = 2.0        # los cálculos más lentos se guardan en memoria
MAX_CACHE = 256
ADVERTENCIAS_METODO = {
    "GENERICO": ("Casi no hay réplicas registradas de este sismo, así que el cálculo usa valores típicos de otras "
                 "regiones del mundo. Tómelo como una referencia general, no como algo propio de este sismo."),
    "GENERICO_A_SECUENCIA": ("Hay pocas réplicas registradas de este sismo: el cálculo combina lo observado con valores "
                             "típicos de otras regiones, así que es menos preciso."),
}


# ─── Matemática (sin acceso a datos) ────────────────────────────────────────

def integral_omori(c: float | np.ndarray, p: float | np.ndarray, t1: float, t2: float) -> np.ndarray:
    """∫_{t1}^{t2} (t + c)^(−p) dt, estable para p → 1."""
    c, p = np.asarray(c, dtype=float), np.asarray(p, dtype=float)
    uno = np.abs(p - 1) < 1e-6
    q = np.where(uno, 0.5, 1 - p)  # evita dividir entre 0 en la rama que no se usa
    general = ((t2 + c) ** q - (t1 + c) ** q) / q
    return np.where(uno, np.log((t2 + c) / (t1 + c)), general)


def _nll(theta: np.ndarray, t: np.ndarray, t1: float, t2: float) -> float:
    """−log L de un proceso de Poisson no homogéneo con tasa K (t + c)^(−p); θ = (ln K, ln c, p)."""
    ln_k, ln_c, p = theta
    c = np.exp(ln_c)
    integral = float(integral_omori(c, p, t1, t2))
    return float(-(t.size * ln_k - p * np.log(t + c).sum() - np.exp(ln_k) * integral))


def _hessiano(f, x: np.ndarray, pasos: np.ndarray) -> np.ndarray:
    n = x.size
    h = np.zeros((n, n))
    for i in range(n):
        for j in range(i, n):
            ei, ej = np.eye(n)[i] * pasos[i], np.eye(n)[j] * pasos[j]
            valor = (f(x + ei + ej) - f(x + ei - ej) - f(x - ei + ej) + f(x - ei - ej)) / (4 * pasos[i] * pasos[j])
            h[i, j] = h[j, i] = valor
    return h


@dataclass(frozen=True)
class AjusteOmori:
    k: float
    c: float
    p: float
    covarianza: list[list[float]] | None  # de (ln K, ln c, p)


def ajustar_omori(t: np.ndarray, t1: float, t2: float) -> AjusteOmori:
    """MLE de (K, c, p) con los tiempos (días desde el principal) en [t1, t2]."""
    t = np.asarray(t, dtype=float)
    n = t.size
    if n < 2:
        raise ValueError("Se necesitan al menos 2 réplicas para ajustar Omori-Utsu")

    def perfil(v: np.ndarray) -> float:
        c, p = np.exp(v[0]), v[1]
        k = n / float(integral_omori(c, p, t1, t2))
        return _nll(np.array([np.log(k), v[0], p]), t, t1, t2)

    mejor = None
    for c0 in (0.01, 0.1, 1.0):
        for p0 in (0.8, 1.1, 1.4):
            r = optimize.minimize(perfil, np.array([np.log(c0), p0]), method="L-BFGS-B",
                                  bounds=[tuple(np.log(LIMITES_C)), LIMITES_P])
            if mejor is None or r.fun < mejor.fun:
                mejor = r
    assert mejor is not None
    c, p = float(np.exp(mejor.x[0])), float(mejor.x[1])
    k = n / float(integral_omori(c, p, t1, t2))
    theta = np.array([np.log(k), np.log(c), p])
    covarianza = None
    try:
        h = _hessiano(lambda x: _nll(x, t, t1, t2), theta, np.array([1e-4, 1e-4, 1e-4]))
        cov = np.linalg.inv(h)
        if np.all(np.isfinite(cov)) and np.all(np.linalg.eigvalsh((cov + cov.T) / 2) > 0):
            covarianza = cov.tolist()
    except np.linalg.LinAlgError:
        pass
    return AjusteOmori(k, c, p, covarianza)


@dataclass
class ParametrosRJ:
    a: float
    b: float
    p: float
    c: float
    mm: float
    mc: float
    metodo: str  # MAXIMA_VEROSIMILITUD | GENERICO_A_SECUENCIA | GENERICO
    n_replicas: int
    b_estimado: bool
    error_b: float | None = None
    covarianza: list[list[float]] | None = None  # de (ln K, ln c, p) con K = 10^(a + b(Mm − Mc))
    avisos: list[str] = field(default_factory=list)

    def tasa_integrada(self, magnitud: float, t1: float, t2: float) -> float:
        """Número esperado de réplicas ≥ magnitud entre t1 y t2 días."""
        return float(10 ** (self.a + self.b * (self.mm - magnitud)) * integral_omori(self.c, self.p, t1, t2))


def ajustar_reasenberg_jones(tiempos: np.ndarray, magnitudes: np.ndarray, mm: float, t_fin: float,
                             mc: float | None = None) -> ParametrosRJ:
    """Ajuste con las réplicas en (0, t_fin] días. Respaldo genérico si hay pocas."""
    tiempos = np.asarray(tiempos, dtype=float)
    magnitudes = np.asarray(magnitudes, dtype=float)
    dentro = (tiempos > 0) & (tiempos <= t_fin)
    tiempos, magnitudes = tiempos[dentro], magnitudes[dentro]
    avisos: list[str] = []
    if mc is None:
        if magnitudes.size >= MIN_EVENTOS_MC:
            mc = sismologia.magnitud_completitud(magnitudes)
        else:
            mc = MC_RESPALDO
            avisos.append(f"Menos de {MIN_EVENTOS_MC} réplicas: Mc de respaldo {MC_RESPALDO}")
    sobre = magnitudes >= mc - 1e-9
    n = int(sobre.sum())
    if n < MIN_REPLICAS_A:
        avisos.append(f"{n} réplicas ≥ Mc (mínimo {MIN_REPLICAS_A}): parámetros genéricos de Reasenberg y Jones (1989)")
        return parametros_genericos(mm, mc, n, avisos)
    if n < MIN_REPLICAS_AJUSTE:
        g = GENERICO
        k = n / float(integral_omori(g["c"], g["p"], 0.0, t_fin))
        avisos.append(f"{n} réplicas ≥ Mc (mínimo {MIN_REPLICAS_AJUSTE} para ajustar p y c): b, p y c genéricos, "
                      "a estimado con la secuencia (Reasenberg y Jones 1994)")
        return ParametrosRJ(float(np.log10(k) - g["b"] * (mm - mc)), g["b"], g["p"], g["c"], mm, float(mc),
                            "GENERICO_A_SECUENCIA", n, False, None, None, avisos)

    if n >= MIN_REPLICAS_B:
        vb = sismologia.aki_utsu(magnitudes, mc)
        b, error_b, b_estimado = vb.b, vb.error_b, True
    else:
        b, error_b, b_estimado = GENERICO["b"], None, False
        avisos.append(f"{n} réplicas ≥ Mc (mínimo {MIN_REPLICAS_B} para b): b genérico {GENERICO['b']}")
    ajuste = ajustar_omori(tiempos[sobre], 0.0, t_fin)
    if ajuste.covarianza is None:
        avisos.append("La covarianza del ajuste no es definida positiva: el intervalo solo incluye la variabilidad de Poisson")
    if np.isclose(ajuste.p, LIMITES_P, rtol=1e-3).any() or np.isclose(ajuste.c, LIMITES_C, rtol=1e-3).any():
        avisos.append(f"El ajuste llegó al límite de p ({ajuste.p:.2f}) o de c ({ajuste.c:.4f}): la secuencia no sigue "
                      "bien el decaimiento de Omori (p. ej. un enjambre dentro de la ventana)")
    a = float(np.log10(ajuste.k) - b * (mm - mc))
    return ParametrosRJ(a, float(b), ajuste.p, ajuste.c, mm, float(mc), "MAXIMA_VEROSIMILITUD", n, b_estimado,
                        error_b, ajuste.covarianza, avisos)


def parametros_genericos(mm: float, mc: float, n: int = 0, avisos: list[str] | None = None) -> ParametrosRJ:
    g = GENERICO
    return ParametrosRJ(g["a"], g["b"], g["p"], g["c"], mm, float(mc), "GENERICO", n, False, None, None, avisos or [])


def _muestras(par: ParametrosRJ, rng: np.random.Generator, n: int) -> dict[str, np.ndarray] | None:
    """Muestras de (log10 K, c, p, b) desde la normal asintótica del MLE."""
    if par.metodo != "MAXIMA_VEROSIMILITUD" or par.covarianza is None:
        return None
    ln_k = np.log(10 ** (par.a + par.b * (par.mm - par.mc)))
    theta = rng.multivariate_normal([ln_k, np.log(par.c), par.p], np.array(par.covarianza), size=n)
    b = rng.normal(par.b, par.error_b, size=n) if (par.b_estimado and par.error_b) else np.full(n, par.b)
    return {"log10k": theta[:, 0] / np.log(10), "c": np.exp(theta[:, 1]),
            "p": np.clip(theta[:, 2], 0.05, None), "b": np.clip(b, 0.3, None)}


def _numero_esperado_muestras(par: ParametrosRJ, muestras: dict[str, np.ndarray], magnitud: float,
                              t1: float, t2: float) -> np.ndarray:
    return 10 ** (muestras["log10k"] - muestras["b"] * (magnitud - par.mc)) \
        * integral_omori(muestras["c"], muestras["p"], t1, t2)


def pronosticar_ventana(par: ParametrosRJ, magnitud: float, t1: float, t2: float,
                        rng: np.random.Generator, muestras: dict[str, np.ndarray] | None) -> dict[str, float]:
    """N esperado, P(≥1) e intervalo del 95 % del número de réplicas ≥ magnitud en [t1, t2]."""
    esperado = par.tasa_integrada(magnitud, t1, t2)
    if muestras is None:
        inferior, superior = stats.poisson.ppf([0.025, 0.975], esperado)
        probabilidad = 1 - np.exp(-esperado)
    else:
        n_s = _numero_esperado_muestras(par, muestras, magnitud, t1, t2)
        conteos = rng.poisson(np.clip(n_s, 0, 1e7))
        inferior, superior = np.quantile(conteos, [0.025, 0.975])
        probabilidad = float(np.mean(1 - np.exp(-n_s)))
    return {"magnitud": magnitud, "esperado": round(esperado, 4), "probabilidad": round(float(probabilidad), 4),
            "ic95": [int(inferior), int(superior)]}


def pronosticar(par: ParametrosRJ, t_inicio: float, rng: np.random.Generator,
                magnitudes: tuple[float, ...] = MAGNITUDES,
                horizontes: dict[str, float] = HORIZONTES_DIAS) -> list[dict[str, object]]:
    muestras = _muestras(par, rng, N_SIMULACIONES)
    return [{"horizonte": nombre, "dias": dias,
             "magnitudes": [pronosticar_ventana(par, m, t_inicio, t_inicio + dias, rng, muestras) for m in magnitudes]}
            for nombre, dias in horizontes.items()]


def curva(par: ParametrosRJ, tiempos: np.ndarray, magnitudes: np.ndarray, t_fin_ajuste: float, t_datos: float,
          t_max: float, rng: np.random.Generator) -> list[dict[str, object]]:
    """Acumulado observado (≥ Mc) contra esperado con banda del 95 %, en una malla logarítmica."""
    muestras = _muestras(par, rng, N_SIMULACIONES)
    obs = np.sort(np.asarray(tiempos, dtype=float)[np.asarray(magnitudes) >= par.mc - 1e-9])
    malla = np.unique(np.concatenate([np.geomspace(0.01, max(t_max, 0.02), PUNTOS_CURVA), [t_fin_ajuste]]))
    puntos = []
    for t in malla:
        v = pronosticar_ventana(par, par.mc, 0.0, float(t), rng, muestras)
        puntos.append({
            "dias": round(float(t), 4),
            "observado": int(np.searchsorted(obs, t, side="right")) if t <= t_datos + 1e-9 else None,
            "esperado": v["esperado"], "inferior": v["ic95"][0], "superior": v["ic95"][1],
        })
    return puntos


def validar(tiempos: np.ndarray, magnitudes: np.ndarray, mm: float, t_datos: float, rng: np.random.Generator,
            ventanas_horas: tuple[int, ...] = VENTANAS_VALIDACION_HORAS) -> list[dict[str, object]]:
    """Backtesting: ajusta con las primeras horas y compara con lo observado después.
    Si los datos no cubren todo el horizonte, se compara solo la parte cubierta (`cobertura` < 1)."""
    tiempos, magnitudes = np.asarray(tiempos, float), np.asarray(magnitudes, float)
    resultados = []
    for horas in ventanas_horas:
        t_ajuste = horas / 24
        if t_ajuste >= t_datos:
            continue
        par = ajustar_reasenberg_jones(tiempos, magnitudes, mm, t_ajuste)
        generico = parametros_genericos(mm, par.mc)
        resultados.append({"horasAjuste": horas, "parametros": _resumen_parametros(par),
                           "horizontes": _comparar(par, tiempos, magnitudes, t_ajuste, t_datos, rng),
                           # Referencia: los parámetros genéricos sin ajustar nada a la secuencia.
                           "horizontesGenerico": _comparar(generico, tiempos, magnitudes, t_ajuste, t_datos, rng)})
    return resultados


def _comparar(par: ParametrosRJ, tiempos: np.ndarray, magnitudes: np.ndarray, t_ajuste: float, t_datos: float,
              rng: np.random.Generator) -> list[dict[str, object]]:
    muestras = _muestras(par, rng, N_SIMULACIONES)
    magnitudes_eval = sorted({round(par.mc, 1), *map(float, MAGNITUDES)})
    horizontes = []
    for nombre, dias in HORIZONTES_DIAS.items():
        t2 = min(t_ajuste + dias, t_datos)
        filas = []
        for m in magnitudes_eval:
            v = pronosticar_ventana(par, m, t_ajuste, t2, rng, muestras)
            observado = int(((tiempos > t_ajuste) & (tiempos <= t2) & (magnitudes >= m - 1e-9)).sum())
            filas.append({**v, "observado": observado,
                          "dentroIc95": bool(v["ic95"][0] <= observado <= v["ic95"][1]),
                          "logVerosimilitud": round(float(stats.poisson.logpmf(observado, max(v["esperado"], 1e-12))), 4)})
        horizontes.append({"horizonte": nombre, "dias": dias, "cobertura": round((t2 - t_ajuste) / dias, 4),
                           "magnitudes": filas})
    return horizontes


def resumen_validacion(resultados: list[dict[str, object]], clave: str = "horizontes") -> dict[str, object]:
    """Métricas agregadas: fracción de casos dentro del IC 95 % y error absoluto medio."""
    filas = [f for r in resultados for h in r[clave] for f in h["magnitudes"]]  # type: ignore[index]
    if not filas:
        return {"casos": 0}
    return {
        "casos": len(filas),
        "fraccionDentroIc95": round(float(np.mean([f["dentroIc95"] for f in filas])), 4),
        "errorAbsolutoMedio": round(float(np.mean([abs(f["observado"] - f["esperado"]) for f in filas])), 4),
        "logVerosimilitudTotal": round(float(np.sum([f["logVerosimilitud"] for f in filas])), 4),
    }


def _resumen_parametros(par: ParametrosRJ) -> dict[str, object]:
    d = asdict(par)
    for k in ("a", "b", "p", "c", "error_b"):
        if d[k] is not None:
            d[k] = round(float(d[k]), 4)
    return {"a": d["a"], "b": d["b"], "p": d["p"], "c": d["c"], "mm": par.mm, "mc": par.mc, "metodo": par.metodo,
            "nReplicas": par.n_replicas, "bEstimado": par.b_estimado, "errorB": d["error_b"], "avisos": par.avisos}


# ─── Catálogo y secuencias ──────────────────────────────────────────────────

def catalogo_instrumental(url: str) -> pd.DataFrame:
    """SGC + USGS reciente (posterior al corte del SGC, D9), válidos y con ubicación."""
    t = db.tablas(url)["registro_sismico"]
    consulta = (select(t.c.id_sismo, t.c.fecha_hora, t.c.latitud, t.c.longitud, t.c.profundidad_km, t.c.magnitud,
                       t.c.fuente, t.c.municipio, t.c.departamento, t.c.zona)
                .where(t.c.fuente.in_(["SGC", "USGS"]), t.c.es_anomalo.is_(False), t.c.magnitud.is_not(None),
                       t.c.latitud.is_not(None), t.c.longitud.is_not(None)))
    with db.motor(url).connect() as c:
        df = pd.DataFrame(c.execute(consulta).all(),
                          columns=["id_sismo", "fecha_hora", "latitud", "longitud", "profundidad_km", "magnitud",
                                   "fuente", "municipio", "departamento", "zona"])
    for col in ("latitud", "longitud", "profundidad_km", "magnitud"):
        df[col] = pd.to_numeric(df[col]).astype(float)
    df["fecha_hora"] = pd.to_datetime(df["fecha_hora"])
    return df.sort_values("fecha_hora").reset_index(drop=True)


def principales(cat: pd.DataFrame, magnitud_min: float) -> pd.DataFrame:
    """Sismos ≥ magnitud_min que no son réplicas de otro mayor (ventana de Gardner-Knopoff)
    ni su precursor (hasta DIAS_PRECURSOR antes y dentro de la ventana espacial)."""
    candidatos = cat[cat.magnitud >= magnitud_min - 1e-9].sort_values(["magnitud", "fecha_hora"], ascending=[False, True])
    elegidos: list[pd.Series] = []
    for _, fila in candidatos.iterrows():
        es_replica = False
        for p in elegidos:
            distancia, duracion = sismologia.ventana_gardner_knopoff(p.magnitud)
            dt = (fila.fecha_hora - p.fecha_hora).total_seconds() / 86400
            if -DIAS_PRECURSOR <= dt <= float(duracion) and \
                    float(haversine_km(p.latitud, p.longitud, fila.latitud, fila.longitud)) <= float(distancia):
                es_replica = True
                break
        if not es_replica:
            elegidos.append(fila)
    return pd.DataFrame(elegidos).sort_values("fecha_hora", ascending=False) if elegidos else candidatos.iloc[0:0]


def secuencia(cat: pd.DataFrame, principal: pd.Series) -> pd.DataFrame:
    """Réplicas: posteriores, de magnitud ≤ Mm y dentro de la ventana de Gardner-Knopoff."""
    distancia, duracion = sismologia.ventana_gardner_knopoff(principal.magnitud)
    dias = (cat.fecha_hora - principal.fecha_hora).dt.total_seconds() / 86400
    candidatos = cat[(dias > 0) & (dias <= float(duracion)) & (cat.magnitud <= principal.magnitud)
                     & (cat.id_sismo != principal.id_sismo)].copy()
    d = haversine_km(principal.latitud, principal.longitud, candidatos.latitud.to_numpy(), candidatos.longitud.to_numpy())
    candidatos = candidatos[d <= float(distancia)]
    candidatos["dias"] = ((candidatos.fecha_hora - principal.fecha_hora).dt.total_seconds() / 86400).to_numpy()
    return candidatos


# ─── Cálculo y persistencia ─────────────────────────────────────────────────

def _ahora() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def _json(valor: object) -> str:
    return json.dumps(valor, ensure_ascii=False, default=lambda o: o.item() if isinstance(o, np.generic) else str(o))


def _leer_json(valor: object) -> object:
    return json.loads(valor) if isinstance(valor, (str, bytes)) else valor


def _iso(ts) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _contexto(cat: pd.DataFrame, principal: pd.Series, magnitud_min: float) -> dict[str, object]:
    seq = secuencia(cat, principal)
    distancia, duracion = sismologia.ventana_gardner_knopoff(principal.magnitud)
    t_datos = (cat.fecha_hora.max() - principal.fecha_hora).total_seconds() / 86400
    fin_sgc = cat.loc[cat.fuente == "SGC", "fecha_hora"].max()
    return {
        "secuencia": seq, "t_datos": float(t_datos),
        "parametros": {
            "magnitudMinPrincipal": magnitud_min, "ventanaKm": round(float(distancia), 1),
            "ventanaDias": round(float(duracion), 1), "fuentes": sorted(seq.fuente.unique().tolist()),
            "datosHasta": _iso(cat.fecha_hora.max()), "finCatalogoSgc": _iso(fin_sgc) if pd.notna(fin_sgc) else None,
            "nSecuencia": int(len(seq)), "nSimulaciones": N_SIMULACIONES, "semilla": SEMILLA,
            "modelo": "Reasenberg y Jones (1989); Omori-Utsu por máxima verosimilitud",
        },
    }


def _fila(principal: pd.Series, tipo: str, horas: float | None, par: ParametrosRJ, parametros: dict,
          resultados: dict, inicio, fin, ahora: datetime) -> dict[str, object]:
    return {
        "id_sismo_principal": int(principal.id_sismo), "tipo": tipo,
        "horas_ajuste": None if horas is None else round(horas, 2),
        "inicio_ajuste": pd.Timestamp(inicio).to_pydatetime(), "fin_ajuste": pd.Timestamp(fin).to_pydatetime(),
        "metodo": par.metodo, "n_replicas": par.n_replicas, "magnitud_completitud": round(par.mc, 1),
        "valor_a": round(float(np.clip(par.a, -99, 99)), 4), "valor_b": round(float(np.clip(par.b, 0, 9)), 4),
        "valor_p": round(float(np.clip(par.p, 0, 9)), 4), "valor_c": round(float(np.clip(par.c, 0, 99)), 5),
        "parametros": _json({**parametros, **_resumen_parametros(par)}), "resultados": _json(resultados),
        "fecha_calculo": ahora,
    }


_calculando = threading.Lock()


def _calcular(cat: pd.DataFrame, p: pd.Series, magnitud_min: float) -> tuple[ParametrosRJ, dict, dict]:
    """Ajuste (MLE, genérico con a de la secuencia o genérico) y pronóstico desde el último dato disponible."""
    ctx = _contexto(cat, p, magnitud_min)
    seq, t_datos = ctx["secuencia"], ctx["t_datos"]
    rng = np.random.default_rng(SEMILLA)
    par = ajustar_reasenberg_jones(seq.dias.to_numpy(), seq.magnitud.to_numpy(), float(p.magnitud), t_datos)
    resultados = {
        "horizontes": pronosticar(par, t_datos, rng),
        "curva": curva(par, seq.dias.to_numpy(), seq.magnitud.to_numpy(), t_datos, t_datos, max(t_datos, 1.0) + 30, rng),
    }
    return par, ctx, resultados


def recalcular(url: str, magnitud_min: float) -> dict[str, object]:
    """Pronóstico vigente de cada sismo principal ≥ magnitud_min, desde el último dato disponible."""
    if not _calculando.acquire(blocking=False):
        return {"estado": "en_curso"}
    try:
        cat = catalogo_instrumental(url)
        if cat.empty:
            return {"estado": "sin_datos", "principales": 0}
        ahora = _ahora()
        filas = []
        for _, p in principales(cat, magnitud_min).iterrows():
            par, ctx, resultados = _calcular(cat, p, magnitud_min)
            t_datos = ctx["t_datos"]
            filas.append(_fila(p, "PRONOSTICO", t_datos * 24, par, ctx["parametros"], resultados,
                               p.fecha_hora, cat.fecha_hora.max(), ahora))
        if filas:
            with db.motor(url).begin() as c:
                c.execute(insert(db.tablas(url)["pronostico_replicas"]), filas)
        log.info("Pronóstico de réplicas: %d principales ≥ M%.1f", len(filas), magnitud_min)
        return {"estado": "listo", "principales": len(filas)}
    finally:
        _calculando.release()


def _principal_por_id(cat: pd.DataFrame, id_sismo: int) -> pd.Series:
    fila = cat[cat.id_sismo == id_sismo]
    if fila.empty:
        raise SinPrincipal(f"No existe el sismo {id_sismo} en el catálogo instrumental")
    return fila.iloc[0]


def validar_principal(url: str, id_sismo: int, magnitud_min: float) -> dict[str, object]:
    """Validación retrospectiva con 24 h, 72 h y 7 días de ajuste. Guarda una fila por ventana."""
    cat = catalogo_instrumental(url)
    p = _principal_por_id(cat, id_sismo)
    ctx = _contexto(cat, p, magnitud_min)
    seq, t_datos = ctx["secuencia"], ctx["t_datos"]
    rng = np.random.default_rng(SEMILLA)
    resultados = validar(seq.dias.to_numpy(), seq.magnitud.to_numpy(), float(p.magnitud), t_datos, rng)
    if not resultados:
        raise SinPrincipal("No hay datos posteriores suficientes para validar este sismo")
    ahora = _ahora()
    filas = []
    for r in resultados:
        horas = float(r["horasAjuste"])
        par = ajustar_reasenberg_jones(seq.dias.to_numpy(), seq.magnitud.to_numpy(), float(p.magnitud), horas / 24)
        curva_v = curva(par, seq.dias.to_numpy(), seq.magnitud.to_numpy(), horas / 24, t_datos,
                        min(horas / 24 + 30, max(t_datos, horas / 24 + 1)), np.random.default_rng(SEMILLA))
        res = {"horizontes": r["horizontes"], "horizontesGenerico": r["horizontesGenerico"],
               "resumen": resumen_validacion([r]), "resumenGenerico": resumen_validacion([r], "horizontesGenerico"),
               "curva": curva_v}
        filas.append(_fila(p, "VALIDACION", horas, par, ctx["parametros"], res,
                           p.fecha_hora, p.fecha_hora + pd.Timedelta(hours=horas), ahora))
    with db.motor(url).begin() as c:
        c.execute(insert(db.tablas(url)["pronostico_replicas"]), filas)
    return {"idSismo": id_sismo, "resumen": resumen_validacion(resultados),
            "resumenGenerico": resumen_validacion(resultados, "horizontesGenerico"), "ventanas": len(filas)}


# ─── Lectura ────────────────────────────────────────────────────────────────

def _a_dict(f) -> dict[str, object]:
    return {
        "idPronostico": f.id_pronostico, "tipo": f.tipo,
        "horasAjuste": None if f.horas_ajuste is None else float(f.horas_ajuste),
        "inicioAjuste": _iso(f.inicio_ajuste), "finAjuste": _iso(f.fin_ajuste), "metodo": f.metodo,
        "nReplicas": int(f.n_replicas), "mc": float(f.magnitud_completitud),
        "a": float(f.valor_a), "b": float(f.valor_b), "p": float(f.valor_p), "c": float(f.valor_c),
        "parametros": _leer_json(f.parametros), "resultados": _leer_json(f.resultados),
        "fechaCalculo": _iso(f.fecha_calculo),
    }


def _sismo(url: str, id_sismo: int) -> dict[str, object]:
    t = db.tablas(url)["registro_sismico"]
    with db.motor(url).connect() as c:
        f = c.execute(select(t).where(t.c.id_sismo == id_sismo)).first()
    if f is None:
        raise SinPrincipal(f"No existe el sismo {id_sismo}")
    return {"idSismo": f.id_sismo, "fechaHora": _iso(f.fecha_hora), "magnitud": float(f.magnitud),
            "profundidadKm": None if f.profundidad_km is None else float(f.profundidad_km),
            "latitud": float(f.latitud), "longitud": float(f.longitud), "municipio": f.municipio,
            "departamento": f.departamento, "fuente": f.fuente}


def lista_principales(url: str) -> list[dict[str, object]]:
    """Principales del último cálculo, con su pronóstico de 7 días para M ≥ 4."""
    t = db.tablas(url)["pronostico_replicas"]
    with db.motor(url).connect() as c:
        fecha = c.execute(select(t.c.fecha_calculo).where(t.c.tipo == "PRONOSTICO")
                          .order_by(t.c.fecha_calculo.desc()).limit(1)).scalar()
        if fecha is None:
            return []
        filas = c.execute(select(t).where(t.c.tipo == "PRONOSTICO", t.c.fecha_calculo == fecha)).all()
        validados = {r[0] for r in c.execute(select(t.c.id_sismo_principal).where(t.c.tipo == "VALIDACION")).all()}
    salida = []
    for f in filas:
        d = _a_dict(f)
        siete = next(h for h in d["resultados"]["horizontes"] if h["horizonte"] == "7d")  # type: ignore[index]
        salida.append({**_sismo(url, f.id_sismo_principal), "metodo": d["metodo"], "nReplicas": d["nReplicas"],
                       "probabilidad7dM4": siete["magnitudes"][0]["probabilidad"],
                       "tieneValidacion": f.id_sismo_principal in validados, "fechaCalculo": d["fechaCalculo"]})
    return sorted(salida, key=lambda s: s["fechaHora"], reverse=True)


def detalle(url: str, id_sismo: int) -> dict[str, object]:
    """Pronóstico vigente y última validación (una fila por ventana de ajuste) de un principal."""
    t = db.tablas(url)["pronostico_replicas"]
    with db.motor(url).connect() as c:
        pron = c.execute(select(t).where(t.c.id_sismo_principal == id_sismo, t.c.tipo == "PRONOSTICO")
                         .order_by(t.c.fecha_calculo.desc(), t.c.id_pronostico.desc()).limit(1)).first()
        fecha_val = c.execute(select(t.c.fecha_calculo).where(t.c.id_sismo_principal == id_sismo, t.c.tipo == "VALIDACION")
                              .order_by(t.c.fecha_calculo.desc()).limit(1)).scalar()
        validacion = [] if fecha_val is None else c.execute(
            select(t).where(t.c.id_sismo_principal == id_sismo, t.c.tipo == "VALIDACION", t.c.fecha_calculo == fecha_val)
            .order_by(t.c.horas_ajuste)).all()
    if pron is None:
        raise SinPrincipal(f"El sismo {id_sismo} no tiene pronóstico de réplicas")
    return {"principal": _sismo(url, id_sismo), "pronostico": _a_dict(pron), "validacion": [_a_dict(v) for v in validacion]}


# ─── Pronóstico al vuelo para cualquier sismo ───────────────────────────────

_cache: dict[tuple[int, str], dict[str, object]] = {}
_cache_lock = threading.Lock()


def _validaciones(url: str, id_sismo: int) -> list[dict[str, object]]:
    t = db.tablas(url)["pronostico_replicas"]
    with db.motor(url).connect() as c:
        fecha = c.execute(select(t.c.fecha_calculo).where(t.c.id_sismo_principal == id_sismo, t.c.tipo == "VALIDACION")
                          .order_by(t.c.fecha_calculo.desc()).limit(1)).scalar()
        if fecha is None:
            return []
        filas = c.execute(select(t).where(t.c.id_sismo_principal == id_sismo, t.c.tipo == "VALIDACION",
                                          t.c.fecha_calculo == fecha).order_by(t.c.horas_ajuste)).all()
    return [_a_dict(f) for f in filas]


def _posible_replica(cat: pd.DataFrame, p: pd.Series) -> pd.Series | None:
    """Sismo mayor anterior en cuya ventana de Gardner-Knopoff cae este (es decir, podría ser su réplica)."""
    mayores = cat[(cat.magnitud > p.magnitud) & (cat.fecha_hora < p.fecha_hora)]
    if mayores.empty:
        return None
    distancia, duracion = sismologia.ventana_gardner_knopoff(mayores.magnitud.to_numpy())
    dias = (p.fecha_hora - mayores.fecha_hora).dt.total_seconds().to_numpy() / 86400
    km = haversine_km(p.latitud, p.longitud, mayores.latitud.to_numpy(), mayores.longitud.to_numpy())
    dentro = (dias <= duracion) & (km <= distancia)
    return mayores[dentro].sort_values("magnitud").iloc[-1] if dentro.any() else None


def pronostico_sismo(url: str, id_sismo: int, magnitud_min: float) -> dict[str, object]:
    """Pronóstico de réplicas de cualquier sismo SGC o USGS con M ≥ 4, desde el último dato disponible.

    Si el sismo ya tiene un pronóstico guardado (es un principal M ≥ magnitud_min), se devuelve ese. Si no,
    se calcula al vuelo con la misma lógica de recalcular() y no se guarda en la base; si el cálculo tarda más
    de SEGUNDOS_PARA_CACHE, el resultado se guarda en memoria hasta que lleguen datos nuevos."""
    try:
        guardado = detalle(url, id_sismo)
    except SinPrincipal:
        guardado = None
    if guardado is not None:
        metodo = guardado["pronostico"]["metodo"]
        return {**guardado, "metodo": metodo, "advertencia": ADVERTENCIAS_METODO.get(metodo), "origen": "GUARDADO"}

    cat = catalogo_instrumental(url)
    p = _principal_por_id(cat, id_sismo)
    if float(p.magnitud) < MAGNITUD_MIN_CONSULTA - 1e-9:
        raise MagnitudInsuficiente(f"El pronóstico de réplicas solo se calcula para sismos de magnitud "
                                   f"{MAGNITUD_MIN_CONSULTA:g} o mayor (este es de {float(p.magnitud):.1f}).")
    llave = (int(id_sismo), _iso(cat.fecha_hora.max()))
    with _cache_lock:
        if llave in _cache:
            return {**_cache[llave], "validacion": _validaciones(url, id_sismo), "origen": "CACHE"}

    inicio = time.perf_counter()
    par, ctx, resultados = _calcular(cat, p, magnitud_min)
    ahora = _ahora()
    advertencias = [ADVERTENCIAS_METODO[par.metodo]] if par.metodo in ADVERTENCIAS_METODO else []
    mayor = _posible_replica(cat, p)
    if mayor is not None:
        advertencias.append(f"Este sismo podría ser una réplica de uno mayor (magnitud {float(mayor.magnitud):.1f} del "
                            f"{pd.Timestamp(mayor.fecha_hora):%d/%m/%Y}); sus propias réplicas se mezclan con las de ese sismo.")
    pronostico = {
        "idPronostico": None, "tipo": "PRONOSTICO", "horasAjuste": round(ctx["t_datos"] * 24, 2),
        "inicioAjuste": _iso(p.fecha_hora), "finAjuste": _iso(cat.fecha_hora.max()), "metodo": par.metodo,
        "nReplicas": par.n_replicas, "mc": round(par.mc, 1), "a": round(par.a, 4), "b": round(par.b, 4),
        "p": round(par.p, 4), "c": round(par.c, 5),
        "parametros": {**ctx["parametros"], **_resumen_parametros(par)}, "resultados": resultados,
        "fechaCalculo": _iso(ahora),
    }
    respuesta = {"principal": _sismo(url, id_sismo), "pronostico": json.loads(_json(pronostico)),
                 "metodo": par.metodo, "advertencia": " ".join(advertencias) or None}
    duracion = time.perf_counter() - inicio
    if duracion > SEGUNDOS_PARA_CACHE:
        with _cache_lock:
            if len(_cache) >= MAX_CACHE:
                _cache.pop(next(iter(_cache)))
            _cache[llave] = respuesta
    log.info("Pronóstico de réplicas al vuelo del sismo %d: %s en %.2f s", id_sismo, par.metodo, duracion)
    return {**respuesta, "validacion": _validaciones(url, id_sismo), "origen": "CALCULADO"}
