"""Periodos de retorno y mapa de amenaza con el catálogo histórico (fase 4 de la analítica).

Catálogo: USGS_HIST (M ≥ 4,5 desde 1973, D14) depurado de réplicas con
Gardner-Knopoff (todos los eventos tienen epicentro). La hipótesis de Poisson
exige eventos independientes; por eso se usa el catálogo depurado.

- Gutenberg-Richter por zona (a anual, b de Aki-Utsu con Mc por máxima curvatura
  sobre todo el catálogo). Las zonas con menos de `MIN_EVENTOS_ZONA` eventos ≥ Mc
  se analizan con su región natural, como en el análisis de frecuencia.
- Periodo de retorno Tr(M) = 1/λ(M), con λ(M) = 10^(a − b·M), para M 5, 6 y 7, y
  P(al menos uno en t) = 1 − exp(−λ t) para 30 días y 1, 5, 10 y 50 años. El rango
  de Tr se obtiene con b ± σb (Shi y Bolt) manteniendo la tasa en Mc.
- Mapa de sismicidad suavizada (Frankel 1995, BSSA 85:1265): conteos de eventos ≥ Mc
  en celdas de 0,5°, suavizados con un kernel gaussiano de distancia de correlación
  c = 50 km, ñ_i = Σ n_j e^(−Δ²/c²) / Σ e^(−Δ²/c²); tasa ≥ 5 con el b regional, y
  P(M ≥ 5 en 10 años) por celda.

Son tasas promedio de largo plazo, no un pronóstico de cuándo ocurrirá un sismo.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sqlalchemy import insert, select

from sismocol import analisis, db, sismologia
from sismocol.geo import BBOX_HISTORICO, haversine_km

log = logging.getLogger("sismocol.amenaza")

FUENTE = "USGS_HIST"
MAGNITUDES_RETORNO = (5.0, 6.0, 7.0)
HORIZONTES = {"dias30": 30 / sismologia.DIAS_POR_ANIO, "anios1": 1.0, "anios5": 5.0, "anios10": 10.0, "anios50": 50.0}
MIN_EVENTOS_ZONA = 30
TAMANO_CELDA = 0.5
DISTANCIA_CORRELACION_KM = 50.0
MAGNITUD_MAPA = 5.0
ANIOS_MAPA = 10.0


class SinCatalogoHistorico(LookupError):
    pass


# ─── Catálogo ───────────────────────────────────────────────────────────────

def catalogo_historico(url: str) -> pd.DataFrame:
    t = db.tablas(url)["registro_sismico"]
    consulta = (select(t.c.id_sismo, t.c.fecha_hora, t.c.latitud, t.c.longitud, t.c.profundidad_km, t.c.magnitud, t.c.zona)
                .where(t.c.fuente == FUENTE, t.c.es_anomalo.is_(False), t.c.magnitud.is_not(None),
                       t.c.latitud.is_not(None), t.c.longitud.is_not(None)))
    with db.motor(url).connect() as c:
        df = pd.DataFrame(c.execute(consulta).all(),
                          columns=["id_sismo", "fecha_hora", "latitud", "longitud", "profundidad_km", "magnitud", "zona"])
    if df.empty:
        raise SinCatalogoHistorico("No hay catálogo histórico USGS. Sincronícelo en Administración → Datos y modelo.")
    for col in ("latitud", "longitud", "profundidad_km", "magnitud"):
        df[col] = pd.to_numeric(df[col]).astype(float)
    df["fecha_hora"] = pd.to_datetime(df["fecha_hora"])
    return df.sort_values("fecha_hora").reset_index(drop=True)


def depurar(cat: pd.DataFrame) -> pd.DataFrame:
    """Quita las réplicas con Gardner-Knopoff (D13 exige epicentro: aquí todos lo tienen)."""
    dias = (cat.fecha_hora - pd.Timestamp("1970-01-01")).dt.total_seconds().to_numpy() / 86400
    replica = sismologia.gardner_knopoff(dias, cat.latitud.to_numpy(), cat.longitud.to_numpy(), cat.magnitud.to_numpy())
    return cat[~replica].reset_index(drop=True)


def completitud_por_decada(cat: pd.DataFrame) -> dict[str, float]:
    decadas = (cat.fecha_hora.dt.year // 10) * 10
    return {f"{int(d)}s": sismologia.magnitud_completitud(g.magnitud.to_numpy())
            for d, g in cat.groupby(decadas) if len(g) >= 20}


def anios(cat: pd.DataFrame, fin: pd.Timestamp | None = None) -> float:
    fin = fin if fin is not None else cat.fecha_hora.max()
    return float((fin - cat.fecha_hora.min()).total_seconds() / 86400 / sismologia.DIAS_POR_ANIO)


# ─── Periodos de retorno ────────────────────────────────────────────────────

def tasa_anual(a: float, b: float, magnitud: float) -> float:
    return float(10 ** (a - b * magnitud))


def periodo_retorno(a: float, b: float, error_b: float, mc: float, magnitud: float) -> dict[str, float]:
    """Tr y su rango con b ± σb, fijando la tasa en Mc (log10 λ(Mc) = a − b·Mc)."""
    lambda_mc = a - b * mc
    tasas = [10 ** (lambda_mc - bb * (magnitud - mc)) for bb in (b - error_b, b, b + error_b) if bb > 0]
    tasa = tasa_anual(a, b, magnitud)
    return {"tasa": tasa, "tr": 1 / tasa, "trMin": 1 / max(tasas), "trMax": 1 / min(tasas)}


def probabilidades(tasa: float) -> dict[str, float]:
    return {k: float(1 - np.exp(-tasa * t)) for k, t in HORIZONTES.items()}


def grupos(cat: pd.DataFrame, mc: float) -> list[tuple[str, str | None, pd.DataFrame]]:
    """(zona, agrupada_en, eventos) para cada zona con eventos; agrupa las pequeñas en su región."""
    con_zona = cat[cat.zona.notna()].copy()
    con_zona["region"] = con_zona.zona.map(analisis.region_zona)
    salida = []
    for zona, g in con_zona.groupby("zona"):
        if int((g.magnitud >= mc - 1e-9).sum()) >= MIN_EVENTOS_ZONA:
            salida.append((str(zona), None, g))
        else:
            region = analisis.region_zona(str(zona))
            salida.append((str(zona), region, con_zona[con_zona.region == region]))
    return salida


def periodos_retorno(cat: pd.DataFrame, mc: float, fin: pd.Timestamp) -> list[dict[str, object]]:
    t = anios(cat, fin)
    filas = []
    for zona, agrupada, eventos in grupos(cat, mc):
        sobre = eventos.magnitud.to_numpy()
        try:
            vb = sismologia.aki_utsu(sobre, mc)
        except ValueError as error:
            log.info("Zona %s sin Gutenberg-Richter: %s", zona, error)
            continue
        if vb.n < 10:
            continue
        a = float(np.log10(vb.n / t) + vb.b * mc)
        maxima = float(eventos.magnitud.max())
        for m in MAGNITUDES_RETORNO:
            tr = periodo_retorno(a, vb.b, vb.error_b, mc, m)
            filas.append({
                "zona": zona, "agrupada_en": agrupada, "n_eventos": vb.n, "magnitud_completitud": mc,
                "valor_a": a, "valor_b": vb.b, "error_b": vb.error_b, "magnitud": m, "tasa_anual": tr["tasa"],
                "periodo_retorno": tr["tr"], "periodo_retorno_min": tr["trMin"], "periodo_retorno_max": tr["trMax"],
                "magnitud_maxima_observada": maxima, "extrapolado": bool(m > maxima),
                "probabilidades": probabilidades(tr["tasa"]),
            })
    return filas


# ─── Mapa de sismicidad suavizada ───────────────────────────────────────────

def malla(bbox: dict[str, float] = BBOX_HISTORICO, paso: float = TAMANO_CELDA) -> tuple[np.ndarray, np.ndarray]:
    """Centros de las celdas (lat, lon)."""
    lats = np.arange(bbox["lat_min"] + paso / 2, bbox["lat_max"], paso)
    lons = np.arange(bbox["lon_min"] + paso / 2, bbox["lon_max"], paso)
    lat, lon = np.meshgrid(lats, lons, indexing="ij")
    return lat.ravel(), lon.ravel()


def suavizar(conteos: np.ndarray, lat: np.ndarray, lon: np.ndarray, c_km: float = DISTANCIA_CORRELACION_KM) -> np.ndarray:
    """Frankel (1995): promedio ponderado con e^(−Δ²/c²), normalizado para conservar el total."""
    d = haversine_km(lat[:, None], lon[:, None], lat[None, :], lon[None, :])
    w = np.exp(-(d / c_km) ** 2)
    w[d > 3 * c_km] = 0.0
    return (w @ conteos) / w.sum(axis=1)


def mapa_amenaza(cat: pd.DataFrame, mc: float, b: float, fin: pd.Timestamp,
                 c_km: float = DISTANCIA_CORRELACION_KM) -> pd.DataFrame:
    lat, lon = malla()
    sobre = cat[cat.magnitud >= mc - 1e-9]
    i = np.floor((sobre.latitud - BBOX_HISTORICO["lat_min"]) / TAMANO_CELDA).astype(int)
    j = np.floor((sobre.longitud - BBOX_HISTORICO["lon_min"]) / TAMANO_CELDA).astype(int)
    n_lon = int(round((BBOX_HISTORICO["lon_max"] - BBOX_HISTORICO["lon_min"]) / TAMANO_CELDA))
    n_lat = int(round((BBOX_HISTORICO["lat_max"] - BBOX_HISTORICO["lat_min"]) / TAMANO_CELDA))
    validos = (i >= 0) & (i < n_lat) & (j >= 0) & (j < n_lon)
    conteos = np.bincount((i[validos] * n_lon + j[validos]).to_numpy(), minlength=lat.size).astype(float)
    suave = suavizar(conteos, lat, lon, c_km)
    t = anios(cat, fin)
    tasa_mc = suave / t
    tasa_m = tasa_mc * 10 ** (-b * (MAGNITUD_MAPA - mc))
    return pd.DataFrame({
        "latitud": lat, "longitud": lon, "eventos": conteos, "tasa_mc": tasa_mc, "tasa_m5": tasa_m,
        "probabilidad_10a": 1 - np.exp(-tasa_m * ANIOS_MAPA),
    })


# ─── Cálculo y persistencia ─────────────────────────────────────────────────

_calculando = threading.Lock()


def recalcular(url: str) -> dict[str, object]:
    if not _calculando.acquire(blocking=False):
        return {"estado": "en_curso"}
    try:
        completo = catalogo_historico(url)
        cat = depurar(completo)
        fin = completo.fecha_hora.max()
        mc = max(sismologia.magnitud_completitud(cat.magnitud.to_numpy()), 4.5)
        vb_total = sismologia.aki_utsu(cat.magnitud.to_numpy(), mc)
        retorno = periodos_retorno(cat, mc, fin)
        mapa = mapa_amenaza(cat, mc, vb_total.b, fin)
        parametros = {
            "catalogo": FUENTE, "magnitudMinCatalogo": 4.5, "depuracion": "Gardner-Knopoff (1974)",
            "eventosCatalogo": int(len(completo)), "eventosDepurados": int(len(cat)),
            "mc": mc, "mcPorDecada": completitud_por_decada(cat), "bRegional": round(vb_total.b, 4),
            "errorBRegional": round(vb_total.error_b, 4), "anios": round(anios(cat, fin), 3),
            "minEventosZona": MIN_EVENTOS_ZONA, "tamanoCeldaGrados": TAMANO_CELDA,
            "distanciaCorrelacionKm": DISTANCIA_CORRELACION_KM, "magnitudMapa": MAGNITUD_MAPA, "aniosMapa": ANIOS_MAPA,
            "bbox": BBOX_HISTORICO, "metodoMapa": "Sismicidad suavizada con kernel gaussiano (Frankel 1995)",
        }
        ahora = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
        t = db.tablas(url)
        with db.motor(url).begin() as c:
            id_calculo = c.execute(insert(t["calculo_amenaza"]).values(
                catalogo=FUENTE, periodo_inicio=cat.fecha_hora.min().to_pydatetime(), periodo_fin=fin.to_pydatetime(),
                parametros=json.dumps(parametros), fecha_calculo=ahora,
            )).inserted_primary_key[0]
            if retorno:
                c.execute(insert(t["periodo_retorno"]), [{
                    "id_calculo": id_calculo, **{k: v for k, v in f.items() if k != "probabilidades"},
                    "probabilidades": json.dumps(f["probabilidades"]),
                } for f in retorno])
            c.execute(insert(t["amenaza_celda"]), [{"id_calculo": id_calculo, **{k: float(v) for k, v in f.items()}}
                                                   for f in mapa.to_dict("records")])
        log.info("Amenaza: %d periodos de retorno, %d celdas (Mc %.1f, b %.2f)", len(retorno), len(mapa), mc, vb_total.b)
        return {"estado": "listo", "zonas": len({f["zona"] for f in retorno}), "celdas": len(mapa)}
    finally:
        _calculando.release()


def recalcular_en_segundo_plano(url: str) -> None:
    def tarea() -> None:
        try:
            recalcular(url)
        except SinCatalogoHistorico as error:
            log.info("Amenaza omitida: %s", error)
        except Exception:
            log.exception("Cálculo de amenaza fallido")

    threading.Thread(target=tarea, name="amenaza", daemon=True).start()


# ─── Lectura ────────────────────────────────────────────────────────────────

def _iso(ts) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _ultimo(url: str):
    t = db.tablas(url)["calculo_amenaza"]
    with db.motor(url).connect() as c:
        fila = c.execute(select(t).order_by(t.c.fecha_calculo.desc(), t.c.id_calculo.desc()).limit(1)).first()
    if fila is None:
        raise SinCatalogoHistorico("Todavía no hay cálculo de amenaza. Sincronice el catálogo histórico USGS.")
    return fila


def _cabecera(fila) -> dict[str, object]:
    p = fila.parametros
    return {"idCalculo": fila.id_calculo, "catalogo": fila.catalogo, "periodoInicio": _iso(fila.periodo_inicio),
            "periodoFin": _iso(fila.periodo_fin), "parametros": json.loads(p) if isinstance(p, (str, bytes)) else p,
            "fechaCalculo": _iso(fila.fecha_calculo)}


def periodos(url: str) -> dict[str, object]:
    calculo = _ultimo(url)
    t = db.tablas(url)["periodo_retorno"]
    with db.motor(url).connect() as c:
        filas = c.execute(select(t).where(t.c.id_calculo == calculo.id_calculo)).all()
    zonas: dict[str, dict[str, object]] = {}
    for f in filas:
        z = zonas.setdefault(f.zona, {
            "zona": f.zona, "agrupadaEn": f.agrupada_en, "nEventos": int(f.n_eventos), "mc": float(f.magnitud_completitud),
            "a": float(f.valor_a), "b": float(f.valor_b), "errorB": float(f.error_b),
            "magnitudMaximaObservada": float(f.magnitud_maxima_observada), "magnitudes": [],
        })
        prob = f.probabilidades
        z["magnitudes"].append({  # type: ignore[union-attr]
            "magnitud": float(f.magnitud), "tasaAnual": float(f.tasa_anual), "periodoRetorno": float(f.periodo_retorno),
            "periodoRetornoMin": float(f.periodo_retorno_min), "periodoRetornoMax": float(f.periodo_retorno_max),
            "extrapolado": bool(f.extrapolado), "probabilidades": json.loads(prob) if isinstance(prob, (str, bytes)) else prob,
        })
    for z in zonas.values():
        z["magnitudes"].sort(key=lambda m: m["magnitud"])  # type: ignore[union-attr]
    orden = sorted(zonas.values(), key=lambda z: z["magnitudes"][0]["periodoRetorno"])  # type: ignore[index]
    return {**_cabecera(calculo), "zonas": orden}


def mapa(url: str) -> dict[str, object]:
    calculo = _ultimo(url)
    t = db.tablas(url)["amenaza_celda"]
    with db.motor(url).connect() as c:
        filas = c.execute(select(t).where(t.c.id_calculo == calculo.id_calculo)).all()
    return {**_cabecera(calculo), "celdas": [{
        "latitud": float(f.latitud), "longitud": float(f.longitud), "eventos": int(f.eventos),
        "tasaM5": float(f.tasa_m5), "probabilidad10a": float(f.probabilidad_10a),
    } for f in filas]}
