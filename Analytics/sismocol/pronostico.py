"""Pronóstico de la actividad mensual por zona (fase 3 de la analítica).

Para cada zona con análisis propio (no agrupada en su región) se pronostica el
número de sismos M ≥ Mc por mes en los próximos 12 meses con tres modelos:

- SARIMA (statsmodels) sobre log(1 + conteo). El orden se elige por AIC en una
  rejilla pequeña usando solo los datos anteriores al primer origen del
  backtesting, y queda fijo.
- Ingenuo: el último mes observado.
- Media móvil de 12 meses.

Validación por origen móvil: se entrena hasta el mes t y se pronostican t+1..t+3,
para cada t desde el mes MIN_MESES_ENTRENAMIENTO. Se reportan MAE y MAPE (el MAPE
excluye los meses con 0 eventos, donde no está definido). En cada zona se publica
el modelo de menor MAE.

Solo se usan meses completos: el primer y el último mes del catálogo SGC son
parciales (empieza el 10-nov-2022 y termina el 26-ago-2026) y se descartan.
Esto no predice sismos concretos: es un pronóstico del conteo mensual con bandas.
"""

from __future__ import annotations

import json
import logging
import threading
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sqlalchemy import insert, select

from sismocol import analisis, db, sismologia

log = logging.getLogger("sismocol.pronostico")

HORIZONTE_MESES = 12
HORIZONTE_BACKTEST = 3
MIN_MESES_ENTRENAMIENTO = 24
MIN_MESES_SERIE = MIN_MESES_ENTRENAMIENTO + HORIZONTE_BACKTEST
VENTANA_MEDIA = 12
NIVELES = (0.80, 0.95)
MODELOS = ("SARIMA", "INGENUO", "MEDIA_MOVIL_12")
# Rejilla de órdenes (p, d, q) × (P, D, Q, 12). Pequeña a propósito: la serie tiene unos 45 meses.
ORDENES = [(0, 0, 0), (1, 0, 0), (2, 0, 0), (1, 0, 1), (0, 1, 1), (1, 1, 1)]
ESTACIONALES = [(0, 0, 0, 0), (1, 0, 0, 12)]


# ─── Serie ──────────────────────────────────────────────────────────────────

def serie_completa(fechas: pd.Series, inicio: pd.Timestamp, corte: pd.Timestamp) -> pd.Series:
    """Conteo mensual (hora de Colombia) sin el primer ni el último mes si están incompletos."""
    s = analisis.serie_mensual(fechas, corte, inicio)
    serie = pd.Series(s.eventos.to_numpy(dtype=float), index=pd.PeriodIndex(s.mes, freq="M"))
    local = lambda ts: pd.Timestamp(ts).tz_localize("UTC").tz_convert(analisis.ZONA_HORARIA).tz_localize(None)  # noqa: E731
    ini, fin = local(inicio), local(corte)
    if ini > ini.normalize().replace(day=1):
        serie = serie.iloc[1:]
    if fin.normalize() < (fin.normalize() + pd.offsets.MonthEnd(0)):
        serie = serie.iloc[:-1]
    return serie


# ─── Modelos ────────────────────────────────────────────────────────────────

@dataclass
class Pronostico:
    media: np.ndarray
    bandas: dict[float, tuple[np.ndarray, np.ndarray]]


def _sarimax(y: np.ndarray, orden: tuple, estacional: tuple):
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        modelo = SARIMAX(np.log1p(y), order=orden, seasonal_order=estacional,
                         trend="c" if orden[1] == 0 else "n",
                         enforce_stationarity=False, enforce_invertibility=False)
        return modelo.fit(disp=False)


def elegir_orden(y: np.ndarray) -> tuple[tuple, tuple, float]:
    """Orden SARIMA de menor AIC. Los estacionales solo se prueban con ≥ 36 meses."""
    mejor = None
    for orden in ORDENES:
        for estacional in ESTACIONALES:
            if estacional[3] and y.size < 36:
                continue
            try:
                ajuste = _sarimax(y, orden, estacional)
            except Exception:
                continue
            if np.isfinite(ajuste.aic) and (mejor is None or ajuste.aic < mejor[2]):
                mejor = (orden, estacional, float(ajuste.aic))
    return mejor or ((0, 0, 0), (0, 0, 0, 0), float("nan"))


def pronostico_sarima(y: np.ndarray, h: int, orden: tuple, estacional: tuple) -> Pronostico:
    """Mediana e intervalos en la escala original (expm1 de los cuantiles en escala log)."""
    ajuste = _sarimax(y, orden, estacional)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        f = ajuste.get_forecast(h)
        media = np.clip(np.expm1(f.predicted_mean), 0, None)
        bandas = {}
        for nivel in NIVELES:
            ic = np.asarray(f.conf_int(alpha=1 - nivel))
            bandas[nivel] = (np.clip(np.expm1(ic[:, 0]), 0, None), np.clip(np.expm1(ic[:, 1]), 0, None))
    return Pronostico(np.asarray(media), bandas)


def pronostico_base(modelo: str, y: np.ndarray, h: int) -> np.ndarray:
    valor = y[-1] if modelo == "INGENUO" else float(np.mean(y[-VENTANA_MEDIA:]))
    return np.full(h, float(valor))


def _bandas_empiricas(modelo: str, media: np.ndarray, errores_1: np.ndarray) -> dict[float, tuple[np.ndarray, np.ndarray]]:
    """Bandas de los modelos base con los cuantiles de los errores a un paso del backtesting.
    Para el ingenuo crecen con √h (paseo aleatorio); para la media móvil se mantienen."""
    h = np.arange(1, media.size + 1)
    escala = np.sqrt(h) if modelo == "INGENUO" else np.ones_like(h, dtype=float)
    bandas = {}
    for nivel in NIVELES:
        if errores_1.size == 0:
            bandas[nivel] = (media.copy(), media.copy())
            continue
        bajo, alto = np.quantile(errores_1, [(1 - nivel) / 2, (1 + nivel) / 2])
        bandas[nivel] = (np.clip(media + bajo * escala, 0, None), np.clip(media + alto * escala, 0, None))
    return bandas


# ─── Backtesting ────────────────────────────────────────────────────────────

def backtesting(y: np.ndarray, orden: tuple, estacional: tuple,
                h: int = HORIZONTE_BACKTEST, min_entrenamiento: int = MIN_MESES_ENTRENAMIENTO) -> dict[str, dict]:
    """Origen móvil: entrena con y[:t] y pronostica y[t:t+h]. Devuelve errores por modelo."""
    errores: dict[str, list[tuple[int, float, float]]] = {m: [] for m in MODELOS}
    for t in range(min_entrenamiento, y.size):
        reales = y[t:t + h]
        if reales.size == 0:
            break
        entrenamiento = y[:t]
        try:
            sarima = pronostico_sarima(entrenamiento, reales.size, orden, estacional).media
        except Exception:
            sarima = np.full(reales.size, np.nan)
        for modelo, prediccion in (("SARIMA", sarima),
                                   ("INGENUO", pronostico_base("INGENUO", entrenamiento, reales.size)),
                                   ("MEDIA_MOVIL_12", pronostico_base("MEDIA_MOVIL_12", entrenamiento, reales.size))):
            for paso, (real, pred) in enumerate(zip(reales, prediccion), start=1):
                errores[modelo].append((paso, float(real), float(pred)))
    return {m: metricas(e) for m, e in errores.items()}


def metricas(errores: list[tuple[int, float, float]]) -> dict[str, object]:
    validos = [(p, r, f) for p, r, f in errores if np.isfinite(f)]
    if not validos:
        return {"mae": None, "mape": None, "n": 0, "errores1": []}
    real = np.array([r for _, r, _ in validos])
    pred = np.array([f for _, _, f in validos])
    no_cero = real > 0
    return {
        "mae": float(np.mean(np.abs(real - pred))),
        "mape": float(np.mean(np.abs(real[no_cero] - pred[no_cero]) / real[no_cero]) * 100) if no_cero.any() else None,
        "n": len(validos),
        "nMape": int(no_cero.sum()),
        "porHorizonte": {str(p): float(np.mean([abs(r - f) for q, r, f in validos if q == p]))
                         for p in sorted({p for p, _, _ in validos})},
        # Errores real − pronóstico a un paso: sirven para las bandas de los modelos base.
        "errores1": [r - f for p, r, f in validos if p == 1],
    }


@dataclass
class ResultadoZona:
    zona: str
    mc: float
    serie: pd.Series
    orden: tuple
    estacional: tuple
    aic: float
    evaluacion: dict[str, dict]
    ganador: str
    pronosticos: dict[str, Pronostico]


def pronosticar_serie(zona: str, mc: float, serie: pd.Series) -> ResultadoZona:
    y = serie.to_numpy(dtype=float)
    if y.size < MIN_MESES_SERIE:
        raise ValueError(f"La zona «{zona}» tiene {y.size} meses completos (mínimo {MIN_MESES_SERIE})")
    orden, estacional, aic = elegir_orden(y[:MIN_MESES_ENTRENAMIENTO])
    evaluacion = backtesting(y, orden, estacional)
    candidatos = {m: e["mae"] for m, e in evaluacion.items() if e["mae"] is not None}
    ganador = min(candidatos, key=candidatos.get)
    pronosticos: dict[str, Pronostico] = {}
    try:
        pronosticos["SARIMA"] = pronostico_sarima(y, HORIZONTE_MESES, orden, estacional)
    except Exception:
        log.warning("SARIMA no converge con toda la serie de %s", zona)
        if ganador == "SARIMA":
            ganador = min((m for m in candidatos if m != "SARIMA"), key=candidatos.get)
    for modelo in ("INGENUO", "MEDIA_MOVIL_12"):
        media = pronostico_base(modelo, y, HORIZONTE_MESES)
        pronosticos[modelo] = Pronostico(media, _bandas_empiricas(modelo, media, np.array(evaluacion[modelo]["errores1"])))
    return ResultadoZona(zona, mc, serie, orden, estacional, aic, evaluacion, ganador, pronosticos)


# ─── Cálculo y persistencia ─────────────────────────────────────────────────

def _r(v: float | None, d: int = 3) -> float | None:
    return None if v is None or not np.isfinite(v) else round(float(v), d)


def _puntos(resultado: ResultadoZona, modelo: str) -> list[dict[str, object]]:
    p = resultado.pronosticos[modelo]
    ultimo = resultado.serie.index[-1]
    return [{
        "mes": str(ultimo + i + 1), "valor": _r(p.media[i], 2),
        "inferior80": _r(p.bandas[0.80][0][i], 2), "superior80": _r(p.bandas[0.80][1][i], 2),
        "inferior95": _r(p.bandas[0.95][0][i], 2), "superior95": _r(p.bandas[0.95][1][i], 2),
    } for i in range(HORIZONTE_MESES)]


_calculando = threading.Lock()


def recalcular(url: str) -> dict[str, object]:
    if not _calculando.acquire(blocking=False):
        return {"estado": "en_curso"}
    try:
        cat = analisis.catalogo(url)
        corte = analisis.fecha_corte(cat)
        inicio = cat.fecha_hora.min()
        cfg = analisis.configuracion_vigente(url)
        ahora = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
        t = db.tablas(url)
        guardadas, omitidas = 0, []
        for info in analisis.zonas(cat, cfg.min_eventos_zona):
            if info.agrupada_en:
                continue
            propios = cat[cat.zona == info.zona]
            mc = sismologia.magnitud_completitud(propios.magnitud.to_numpy())
            serie = serie_completa(propios.fecha_hora[propios.magnitud >= mc - 1e-9], inicio, corte)
            try:
                r = pronosticar_serie(info.zona, mc, serie)
            except ValueError as error:
                omitidas.append(info.zona)
                log.info("Pronóstico omitido: %s", error)
                continue
            parametros = {
                "mc": mc, "ordenSarima": list(r.orden), "ordenEstacional": list(r.estacional), "aic": _r(r.aic),
                "transformacion": "log1p", "horizonteMeses": HORIZONTE_MESES, "horizonteBacktest": HORIZONTE_BACKTEST,
                "minMesesEntrenamiento": MIN_MESES_ENTRENAMIENTO, "catalogo": "SGC",
                "seleccionOrden": f"AIC con los primeros {MIN_MESES_ENTRENAMIENTO} meses",
            }
            resultados = {
                "serie": [{"mes": str(m), "eventos": int(v)} for m, v in r.serie.items()],
                "pronosticos": {m: _puntos(r, m) for m in r.pronosticos},
            }
            with db.motor(url).begin() as c:
                id_pronostico = c.execute(insert(t["pronostico_actividad"]).values(
                    zona=info.zona, modelo_ganador=r.ganador, magnitud_completitud=round(mc, 1),
                    periodo_inicio=pd.Period(r.serie.index[0], "M").start_time.date(),
                    periodo_fin=pd.Period(r.serie.index[-1], "M").end_time.date(),
                    n_meses=int(r.serie.size), parametros=json.dumps(parametros), resultados=json.dumps(resultados),
                    fecha_calculo=ahora,
                )).inserted_primary_key[0]
                c.execute(insert(t["backtesting_pronostico"]), [{
                    "id_pronostico": id_pronostico, "modelo": m, "mae": _r(e["mae"], 4), "mape": _r(e["mape"], 4),
                    "n_pronosticos": e["n"], "detalle": json.dumps({k: v for k, v in e.items() if k != "errores1"}),
                } for m, e in r.evaluacion.items()])
            guardadas += 1
        log.info("Pronóstico de actividad: %d zonas, %d omitidas", guardadas, len(omitidas))
        return {"estado": "listo", "zonas": guardadas, "omitidas": omitidas}
    finally:
        _calculando.release()


# ─── Lectura ────────────────────────────────────────────────────────────────

def _leer(valor: object) -> object:
    return json.loads(valor) if isinstance(valor, (str, bytes)) else valor


def _iso(ts) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def pronostico_zona(url: str, zona: str) -> dict[str, object]:
    t = db.tablas(url)
    pa, bt = t["pronostico_actividad"], t["backtesting_pronostico"]
    with db.motor(url).connect() as c:
        fila = c.execute(select(pa).where(pa.c.zona == zona)
                         .order_by(pa.c.fecha_calculo.desc(), pa.c.id_pronostico.desc()).limit(1)).first()
        if fila is None:
            raise analisis.SinDatos(f"La zona «{zona}» no tiene pronóstico propio (agrupada o con pocos meses)")
        evaluacion = c.execute(select(bt).where(bt.c.id_pronostico == fila.id_pronostico)).all()
    resultados = _leer(fila.resultados)
    return {
        "zona": fila.zona, "modeloGanador": fila.modelo_ganador, "mc": float(fila.magnitud_completitud),
        "periodoInicio": str(fila.periodo_inicio), "periodoFin": str(fila.periodo_fin), "nMeses": int(fila.n_meses),
        "parametros": _leer(fila.parametros), "serie": resultados["serie"],
        "pronostico": resultados["pronosticos"][fila.modelo_ganador],
        "pronosticos": resultados["pronosticos"],
        "backtesting": sorted(({
            "modelo": e.modelo, "mae": None if e.mae is None else float(e.mae),
            "mape": None if e.mape is None else float(e.mape), "nPronosticos": int(e.n_pronosticos),
            "maePorHorizonte": _leer(e.detalle).get("porHorizonte", {}),
        } for e in evaluacion), key=lambda e: (e["mae"] is None, e["mae"])),
        "fechaCalculo": _iso(fila.fecha_calculo),
    }


def resumen_backtesting(url: str) -> list[dict[str, object]]:
    """MAE por zona y modelo del último cálculo (para el informe de resultados)."""
    t = db.tablas(url)
    pa, bt = t["pronostico_actividad"], t["backtesting_pronostico"]
    with db.motor(url).connect() as c:
        fecha = c.execute(select(pa.c.fecha_calculo).order_by(pa.c.fecha_calculo.desc()).limit(1)).scalar()
        if fecha is None:
            return []
        filas = c.execute(select(pa.c.zona, pa.c.modelo_ganador, pa.c.n_meses, bt.c.modelo, bt.c.mae, bt.c.mape,
                                 bt.c.n_pronosticos)
                          .join(bt, bt.c.id_pronostico == pa.c.id_pronostico)
                          .where(pa.c.fecha_calculo == fecha)).all()
    return [dict(f._mapping) for f in filas]
