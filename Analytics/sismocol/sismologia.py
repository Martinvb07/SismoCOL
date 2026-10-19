"""Estadística sismológica sin acceso a datos (fase 4, CRISP-DM: modelado).

- Magnitud de completitud por máxima curvatura (+0,2).
- Valor b de Aki-Utsu con corrección de bin y error de Shi-Bolt.
- Gutenberg-Richter anual: log10 N(≥M) = a − b·M.
- Mann-Kendall con corrección por empates y pendiente de Sen.
- Probabilidades de Poisson y prueba de conteos para advertencias.
- Depuración de réplicas con las ventanas de Gardner-Knopoff (1974).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import stats

PASO_MAGNITUD = 0.1
CORRECCION_MC = 0.2
ALFA_TENDENCIA = 0.05
DIAS_POR_ANIO = 365.25
RADIO_TIERRA_KM = 6371.0


def _bins(magnitudes: np.ndarray) -> np.ndarray:
    """Redondea a la décima (las magnitudes vienen con un decimal)."""
    return np.round(np.round(magnitudes / PASO_MAGNITUD) * PASO_MAGNITUD, 1)


def magnitud_completitud(magnitudes: np.ndarray) -> float:
    """Máxima curvatura: el bin más poblado de la distribución incremental, + 0,2."""
    if magnitudes.size == 0:
        raise ValueError("No hay magnitudes para estimar Mc")
    valores, conteos = np.unique(_bins(magnitudes), return_counts=True)
    return round(float(valores[np.argmax(conteos)]) + CORRECCION_MC, 1)


@dataclass(frozen=True)
class ValorB:
    b: float
    error_b: float
    n: int


def aki_utsu(magnitudes: np.ndarray, mc: float) -> ValorB:
    """b = log10(e) / (M̄ − (Mc − ΔM/2)); error de Shi y Bolt (1982)."""
    sobre = magnitudes[magnitudes >= mc - 1e-9]
    n = int(sobre.size)
    if n < 2:
        raise ValueError(f"Se necesitan al menos 2 eventos ≥ Mc ({n})")
    media = float(sobre.mean())
    denominador = media - (mc - PASO_MAGNITUD / 2)
    if denominador <= 0:
        raise ValueError("Magnitudes degeneradas: la media no supera Mc")
    b = np.log10(np.e) / denominador
    error = 2.30 * b * b * np.sqrt(np.sum((sobre - media) ** 2) / (n * (n - 1)))
    return ValorB(float(b), float(error), n)


@dataclass(frozen=True)
class PuntoGR:
    magnitud: float
    acumulado: int
    incremental: int


@dataclass(frozen=True)
class GutenbergRichter:
    mc: float
    a: float
    b: float
    error_b: float
    n_eventos: int
    anios: float
    tasa_anual: float
    puntos: list[PuntoGR]


def gutenberg_richter(magnitudes: np.ndarray, anios: float) -> GutenbergRichter:
    """Ajuste con a ANUAL: la tasa de eventos ≥ Mc por año fija la recta en Mc."""
    if anios <= 0:
        raise ValueError("El periodo debe ser positivo")
    mc = magnitud_completitud(magnitudes)
    vb = aki_utsu(magnitudes, mc)
    tasa = vb.n / anios
    a = np.log10(tasa) + vb.b * mc

    valores, incrementales = np.unique(_bins(magnitudes), return_counts=True)
    acumulados = np.cumsum(incrementales[::-1])[::-1]
    puntos = [PuntoGR(float(m), int(acu), int(inc))
              for m, acu, inc in zip(valores, acumulados, incrementales)]
    return GutenbergRichter(mc, float(a), vb.b, vb.error_b, vb.n, float(anios), float(tasa), puntos)


def probabilidad_ocurrencia(a: float, b: float, magnitud: float, anios: float) -> float:
    """P(al menos un sismo ≥ M en t años) = 1 − exp(−10^(a − bM) · t)."""
    return float(1 - np.exp(-(10 ** (a - b * magnitud)) * anios))


@dataclass(frozen=True)
class MannKendall:
    tau: float
    p_valor: float
    pendiente_sen: float
    intercepto_sen: float
    alfa: float
    significativa: bool
    tendencia: str  # CRECIENTE | DECRECIENTE | SIN_TENDENCIA


def mann_kendall(serie: np.ndarray, alfa: float = ALFA_TENDENCIA) -> MannKendall:
    """Prueba de Mann-Kendall (bilateral) con corrección por empates, y recta de Sen
    con t = 0 en el primer elemento."""
    x = np.asarray(serie, dtype=float)
    n = x.size
    if n < 3:
        return MannKendall(0.0, 1.0, 0.0, float(x.mean()) if n else 0.0, alfa, False, "SIN_TENDENCIA")
    i, j = np.triu_indices(n, k=1)
    diferencias = x[j] - x[i]
    s = float(np.sign(diferencias).sum())
    _, empates = np.unique(x, return_counts=True)
    varianza = (n * (n - 1) * (2 * n + 5) - np.sum(empates * (empates - 1) * (2 * empates + 5))) / 18
    if varianza <= 0:
        z = 0.0
    elif s > 0:
        z = (s - 1) / np.sqrt(varianza)
    elif s < 0:
        z = (s + 1) / np.sqrt(varianza)
    else:
        z = 0.0
    p = float(2 * stats.norm.sf(abs(z)))
    pendiente = float(np.median(diferencias / (j - i)))
    intercepto = float(np.median(x - pendiente * np.arange(n)))
    significativa = p < alfa
    tendencia = "SIN_TENDENCIA" if not significativa else ("CRECIENTE" if s > 0 else "DECRECIENTE")
    return MannKendall(s / (n * (n - 1) / 2), p, pendiente, intercepto, alfa, significativa, tendencia)


def p_valor_conteo(observados: int, esperados: float) -> float:
    """P(X ≥ k | X ~ Poisson(μ)). Con k = 0 es 1."""
    if observados <= 0:
        return 1.0
    if esperados <= 0:
        return 0.0
    return float(stats.poisson.sf(observados - 1, esperados))


def nivel_advertencia(p_valor: float, umbral_elevada: float, umbral_alta: float) -> str:
    if p_valor < umbral_alta:
        return "ALTA"
    if p_valor < umbral_elevada:
        return "ELEVADA"
    return "NORMAL"


# ─── Gardner-Knopoff ────────────────────────────────────────────────────────

def ventana_gardner_knopoff(magnitud: np.ndarray | float) -> tuple[np.ndarray, np.ndarray]:
    """(distancia km, duración días) de la ventana de réplicas para cada magnitud."""
    m = np.asarray(magnitud, dtype=float)
    distancia = 10 ** (0.1238 * m + 0.983)
    dias = np.where(m >= 6.5, 10 ** (0.032 * m + 2.7389), 10 ** (0.5409 * m - 0.547))
    return distancia, dias


def _distancia_km(lat1: float, lon1: float, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    f1, f2 = np.radians(lat1), np.radians(lat2)
    df, dl = f2 - f1, np.radians(lon2 - lon1)
    h = np.sin(df / 2) ** 2 + np.cos(f1) * np.cos(f2) * np.sin(dl / 2) ** 2
    return 2 * RADIO_TIERRA_KM * np.arcsin(np.sqrt(np.clip(h, 0, 1)))


def gardner_knopoff(tiempos_dias: np.ndarray, latitudes: np.ndarray, longitudes: np.ndarray,
                    magnitudes: np.ndarray) -> np.ndarray:
    """Marca como réplica todo sismo de magnitud ≤ M que ocurre dentro de la
    ventana espacio-temporal posterior a un sismo principal de magnitud M.
    Los principales se recorren de mayor a menor magnitud; una réplica no
    vuelve a actuar como principal. Sin coordenadas no se marca nada."""
    t = np.asarray(tiempos_dias, dtype=float)
    lat = np.asarray(latitudes, dtype=float)
    lon = np.asarray(longitudes, dtype=float)
    mag = np.asarray(magnitudes, dtype=float)
    n = t.size
    replica = np.zeros(n, dtype=bool)
    if n == 0:
        return replica

    orden_t = np.argsort(t, kind="stable")
    t_ord = t[orden_t]
    con_ubicacion = ~(np.isnan(lat) | np.isnan(lon) | np.isnan(mag))
    distancias, duraciones = ventana_gardner_knopoff(np.nan_to_num(mag))

    for i in np.argsort(-np.nan_to_num(mag, nan=-np.inf), kind="stable"):
        if replica[i] or not con_ubicacion[i]:
            continue
        desde = np.searchsorted(t_ord, t[i], side="left")
        hasta = np.searchsorted(t_ord, t[i] + duraciones[i], side="right")
        candidatos = orden_t[desde:hasta]
        candidatos = candidatos[(candidatos != i) & ~replica[candidatos] & con_ubicacion[candidatos]
                                & (mag[candidatos] <= mag[i]) & (t[candidatos] >= t[i])]
        if candidatos.size == 0:
            continue
        cerca = _distancia_km(lat[i], lon[i], lat[candidatos], lon[candidatos]) <= distancias[i]
        replica[candidatos[cerca]] = True
    return replica
