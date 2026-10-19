"""Análisis de frecuencia por zona y advertencias (fase 4).

Solo se usa el catálogo SGC válido (decisión D9): Mc, Gutenberg-Richter,
tendencia, probabilidades y advertencias se calculan hasta la fecha de corte,
que es el último sismo del SGC. Las réplicas (Gardner-Knopoff) se marcan en
`registro_sismico.es_replica` al recalcular, solo entre sismos con epicentro;
las estadísticas usan el catálogo completo (decisión D13).

Las zonas con menos de `min_eventos_zona` eventos ≥ Mc se analizan con todos
los eventos de su región natural (`agrupadaEn`).
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sqlalchemy import Integer, func, insert, select, update

from sismocol import db, sismologia
from sismocol.territorio import ZONA_NIDO_BUCARAMANGA, NIDO_DEPARTAMENTO, region_de

log = logging.getLogger("sismocol.analisis")

ZONA_HORARIA = "America/Bogota"
MAGNITUDES_PROBABILIDAD = (4, 5, 6)
HORIZONTES_ANIOS = (1, 10)
VENTANA_MEDIA_MOVIL = 12
DIAS_POR_MES = 30.4375
LOTE_ACTUALIZACION = 5000
MIN_EVENTOS_GR = 10


class ZonaNoEncontrada(LookupError):
    pass


class SinDatos(LookupError):
    pass


# ─── Catálogo ───────────────────────────────────────────────────────────────

_cache: dict[str, object] = {}
_cache_lock = threading.Lock()


def _firma(url: str) -> tuple:
    t = db.tablas(url)["registro_sismico"]
    with db.motor(url).connect() as c:
        return tuple(c.execute(
            select(func.count(), func.max(t.c.id_sismo), func.sum(t.c.es_replica.cast(Integer)))
            .where(t.c.fuente == "SGC")
        ).one())


def catalogo(url: str) -> pd.DataFrame:
    """SGC válido con zona y magnitud. Se cachea mientras la tabla no cambie."""
    firma = _firma(url)
    with _cache_lock:
        if _cache.get("firma") == firma:
            return _cache["datos"]  # type: ignore[return-value]
    t = db.tablas(url)["registro_sismico"]
    consulta = (
        select(t.c.id_sismo, t.c.fecha_hora, t.c.latitud, t.c.longitud, t.c.magnitud, t.c.zona, t.c.es_replica)
        .where(t.c.fuente == "SGC", t.c.es_anomalo.is_(False), t.c.zona.is_not(None), t.c.magnitud.is_not(None))
    )
    with db.motor(url).connect() as c:
        df = pd.DataFrame(c.execute(consulta).all(),
                          columns=["id_sismo", "fecha_hora", "latitud", "longitud", "magnitud", "zona", "es_replica"])
    for columna in ("latitud", "longitud", "magnitud"):
        df[columna] = pd.to_numeric(df[columna]).astype(float)
    df["fecha_hora"] = pd.to_datetime(df["fecha_hora"])
    df["es_replica"] = df["es_replica"].astype(bool)
    df["region"] = df["zona"].map(region_zona)
    with _cache_lock:
        _cache.update(firma=firma, datos=df)
    return df


def invalidar_cache() -> None:
    with _cache_lock:
        _cache.clear()


def region_zona(zona: str) -> str:
    departamento = NIDO_DEPARTAMENTO if zona == ZONA_NIDO_BUCARAMANGA else zona
    region = region_de(departamento)
    return f"Región {region}" if region else "Sin región"


def fecha_corte(cat: pd.DataFrame) -> pd.Timestamp:
    if cat.empty:
        raise SinDatos("No hay catálogo SGC cargado. Cargue el Excel desde Administración → Datos y modelo.")
    return cat.fecha_hora.max()


def _iso(ts: pd.Timestamp | datetime) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%S.000Z")


# ─── Configuración ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Configuracion:
    id_config: int
    ventana_dias: int
    periodo_base_meses: int
    umbral_elevada: float
    umbral_alta: float
    min_eventos_zona: int


def configuracion_vigente(url: str) -> Configuracion:
    t = db.tablas(url)["configuracion_analisis"]
    with db.motor(url).connect() as c:
        fila = c.execute(select(t).order_by(t.c.fecha_actualizacion.desc(), t.c.id_config.desc()).limit(1)).first()
    if fila is None:
        raise SinDatos("No hay configuración de análisis. Ejecute el seed de la API.")
    return Configuracion(fila.id_config, int(fila.ventana_dias), int(fila.periodo_base_meses),
                         float(fila.umbral_elevada), float(fila.umbral_alta), int(fila.min_eventos_zona))


# ─── Zonas ──────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class InfoZona:
    zona: str
    region: str
    agrupada_en: str | None
    n_eventos: int


def _mc_seguro(magnitudes: np.ndarray) -> float | None:
    return sismologia.magnitud_completitud(magnitudes) if magnitudes.size else None


def zonas(cat: pd.DataFrame, min_eventos: int) -> list[InfoZona]:
    resultado = []
    for zona, grupo in cat.groupby("zona"):
        mags = grupo.magnitud.to_numpy()
        mc = _mc_seguro(mags)
        sobre_mc = int((mags >= mc - 1e-9).sum()) if mc is not None else 0
        region = region_zona(str(zona))
        resultado.append(InfoZona(str(zona), region, region if sobre_mc < min_eventos else None, int(len(grupo))))
    return sorted(resultado, key=lambda z: -z.n_eventos)


def _buscar_zona(cat: pd.DataFrame, zona: str, min_eventos: int) -> InfoZona:
    for info in zonas(cat, min_eventos):
        if info.zona == zona:
            return info
    raise ZonaNoEncontrada(f"La zona «{zona}» no existe en el catálogo")


def _eventos_analisis(cat: pd.DataFrame, info: InfoZona) -> pd.DataFrame:
    if info.agrupada_en:
        return cat[cat.region == info.agrupada_en]
    return cat[cat.zona == info.zona]


def _anios_catalogo(cat: pd.DataFrame) -> float:
    dias = (cat.fecha_hora.max() - cat.fecha_hora.min()).total_seconds() / 86400
    return max(dias / sismologia.DIAS_POR_ANIO, 0.1)


# ─── Frecuencia y Gutenberg-Richter ─────────────────────────────────────────

def _mes_bogota(fechas_utc: pd.Series) -> pd.Series:
    return pd.to_datetime(fechas_utc).dt.tz_localize("UTC").dt.tz_convert(ZONA_HORARIA).dt.tz_localize(None).dt.to_period("M")


def serie_mensual(fechas: pd.Series, corte: pd.Timestamp, inicio: pd.Timestamp) -> pd.DataFrame:
    """Conteo por mes (hora de Colombia) desde el mes de `inicio` hasta el de corte, sin huecos."""
    extremos = _mes_bogota(pd.Series([inicio, corte]))
    rango = pd.period_range(extremos.iloc[0], extremos.iloc[1], freq="M")
    conteo = _mes_bogota(fechas).value_counts().reindex(rango, fill_value=0)
    media = conteo.rolling(VENTANA_MEDIA_MOVIL).mean()
    return pd.DataFrame({"mes": [str(p) for p in rango], "eventos": conteo.to_numpy(), "media": media.to_numpy()})


def frecuencia(url: str, zona: str) -> dict[str, object]:
    cat = catalogo(url)
    corte = fecha_corte(cat)
    info = _buscar_zona(cat, zona, configuracion_vigente(url).min_eventos_zona)
    eventos = _eventos_analisis(cat, info)
    serie = serie_mensual(eventos.fecha_hora, corte, cat.fecha_hora.min())
    mk = sismologia.mann_kendall(serie.eventos.to_numpy())
    return {
        "zona": info.zona,
        "agrupadaEn": info.agrupada_en,
        "fechaCorte": _iso(corte),
        "serieMensual": [
            {"mes": f.mes, "eventos": int(f.eventos), "mediaMovil12": None if np.isnan(f.media) else round(float(f.media), 2)}
            for f in serie.itertuples()
        ],
        "mannKendall": {
            "tau": round(mk.tau, 4), "pValor": mk.p_valor, "pendienteSen": round(mk.pendiente_sen, 4),
            "interceptoSen": round(mk.intercepto_sen, 4), "alfa": mk.alfa, "significativa": mk.significativa,
            "tendencia": mk.tendencia,
        },
    }


def _gr_de(cat: pd.DataFrame, info: InfoZona) -> sismologia.GutenbergRichter:
    eventos = _eventos_analisis(cat, info)
    if len(eventos) < MIN_EVENTOS_GR:
        raise SinDatos(f"La zona «{info.zona}» tiene muy pocos eventos para Gutenberg-Richter ({len(eventos)})")
    return sismologia.gutenberg_richter(eventos.magnitud.to_numpy(), _anios_catalogo(cat))


def gutenberg_richter(url: str, zona: str) -> dict[str, object]:
    cat = catalogo(url)
    corte = fecha_corte(cat)
    info = _buscar_zona(cat, zona, configuracion_vigente(url).min_eventos_zona)
    gr = _gr_de(cat, info)
    return {
        "zona": info.zona, "agrupadaEn": info.agrupada_en, "fechaCorte": _iso(corte),
        "mc": gr.mc, "a": round(gr.a, 3), "b": round(gr.b, 3), "errorB": round(gr.error_b, 3),
        "nEventos": gr.n_eventos, "anios": round(gr.anios, 2), "tasaAnual": round(gr.tasa_anual, 2),
        "puntos": [{"magnitud": p.magnitud, "acumulado": p.acumulado, "incremental": p.incremental} for p in gr.puntos],
    }


def lista_zonas(url: str) -> list[dict[str, object]]:
    cat = catalogo(url)
    return [{"zona": z.zona, "region": z.region, "agrupadaEn": z.agrupada_en, "nEventos": z.n_eventos}
            for z in zonas(cat, configuracion_vigente(url).min_eventos_zona)]


# ─── Recálculo ──────────────────────────────────────────────────────────────

_recalculo = threading.Lock()


def _marcar_replicas(url: str) -> int:
    """Gardner-Knopoff sobre el SGC válido; actualiza es_replica.

    Solo participan los sismos con epicentro: con el centroide del municipio
    (decisión D2) muchos sismos quedan a 0 km entre sí y la ventana espacial
    pierde sentido. Los demás quedan con coordenadas NaN y nunca se marcan."""
    t = db.tablas(url)["registro_sismico"]
    consulta = (select(t.c.id_sismo, t.c.fecha_hora, t.c.latitud, t.c.longitud, t.c.magnitud, t.c.precision_ubicacion)
                .where(t.c.fuente == "SGC", t.c.es_anomalo.is_(False), t.c.magnitud.is_not(None)))
    with db.motor(url).connect() as c:
        df = pd.DataFrame(c.execute(consulta).all(), columns=["id", "fecha", "lat", "lon", "mag", "precision"])
    if df.empty:
        return 0
    con_epicentro = (df.precision == "EPICENTRO").to_numpy()
    lat = np.where(con_epicentro, pd.to_numeric(df.lat).to_numpy(float), np.nan)
    lon = np.where(con_epicentro, pd.to_numeric(df.lon).to_numpy(float), np.nan)
    dias = (pd.to_datetime(df.fecha) - pd.Timestamp("1970-01-01")).dt.total_seconds().to_numpy() / 86400
    replica = sismologia.gardner_knopoff(dias, lat, lon, pd.to_numeric(df.mag).to_numpy(float))
    ids = df.id[replica].astype(int).tolist()
    with db.motor(url).begin() as c:
        c.execute(update(t).where(t.c.fuente == "SGC", t.c.es_replica.is_(True)).values(es_replica=False))
        for i in range(0, len(ids), LOTE_ACTUALIZACION):
            c.execute(update(t).where(t.c.id_sismo.in_(ids[i:i + LOTE_ACTUALIZACION])).values(es_replica=True))
    invalidar_cache()
    return len(ids)


def _advertencia(cat: pd.DataFrame, info: InfoZona, mc: float, corte: pd.Timestamp, cfg: Configuracion) -> dict:
    """Conteo de la ventana reciente contra la tasa del periodo base (Poisson)."""
    propios = cat[(cat.zona == info.zona) & (cat.magnitud >= mc - 1e-9)]
    fin = corte
    inicio = fin - timedelta(days=cfg.ventana_dias)
    dias_base = cfg.periodo_base_meses * DIAS_POR_MES
    inicio_base = inicio - timedelta(days=dias_base)
    observados = int(((propios.fecha_hora > inicio) & (propios.fecha_hora <= fin)).sum())
    en_base = int(((propios.fecha_hora > inicio_base) & (propios.fecha_hora <= inicio)).sum())
    esperados = en_base / dias_base * cfg.ventana_dias
    # Sin eventos en el periodo base no hay tasa con qué comparar.
    p = sismologia.p_valor_conteo(observados, esperados) if en_base > 0 else 1.0
    return {
        "zona": info.zona,
        "ventana_inicio": inicio.to_pydatetime(),
        "ventana_fin": fin.to_pydatetime(),
        "eventos_observados": observados,
        "eventos_esperados": round(min(esperados, 99999.999), 3),
        "p_valor": round(p, 5),
        "nivel": sismologia.nivel_advertencia(p, cfg.umbral_elevada, cfg.umbral_alta),
    }


def _acotar(valor: float, limite: float, decimales: int) -> float:
    return round(float(np.clip(valor, -limite, limite)), decimales)


def recalcular(url: str) -> dict[str, object]:
    """Réplicas, análisis por zona y advertencias. Guarda un lote nuevo con la misma fecha_calculo."""
    if not _recalculo.acquire(blocking=False):
        return {"estado": "en_curso"}
    try:
        inicio = datetime.now(timezone.utc)
        replicas = _marcar_replicas(url)
        cat = catalogo(url)
        corte = fecha_corte(cat)
        cfg = configuracion_vigente(url)
        anios = _anios_catalogo(cat)
        ahora = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
        t = db.tablas(url)
        guardadas = 0
        with db.motor(url).begin() as c:
            for info in zonas(cat, cfg.min_eventos_zona):
                try:
                    gr = _gr_de(cat, info)
                except (SinDatos, ValueError) as error:
                    log.info("Zona %s sin análisis: %s", info.zona, error)
                    continue
                eventos = _eventos_analisis(cat, info)
                serie = serie_mensual(eventos.fecha_hora, corte, cat.fecha_hora.min())
                mk = sismologia.mann_kendall(serie.eventos.to_numpy())
                id_analisis = c.execute(insert(t["analisis_zona"]).values(
                    id_config=cfg.id_config, zona=info.zona, agrupada_en=info.agrupada_en,
                    periodo_inicio=cat.fecha_hora.min().date(), periodo_fin=corte.date(),
                    n_eventos=gr.n_eventos, magnitud_completitud=gr.mc,
                    valor_a=_acotar(gr.a, 999, 3), valor_b=_acotar(gr.b, 99, 3), error_b=_acotar(gr.error_b, 99, 3),
                    tasa_anual=_acotar(gr.tasa_anual, 99999, 3), tau_tendencia=_acotar(mk.tau, 1, 3),
                    p_valor_tendencia=round(mk.p_valor, 5), pendiente_sen=_acotar(mk.pendiente_sen, 9999, 4),
                    fecha_calculo=ahora,
                )).inserted_primary_key[0]
                c.execute(insert(t["advertencia_actividad"]).values(
                    id_analisis=id_analisis, fecha_emision=ahora, **_advertencia(cat, info, gr.mc, corte, cfg)))
                guardadas += 1
        segundos = (datetime.now(timezone.utc) - inicio).total_seconds()
        log.info("Recálculo listo: %d zonas, %d réplicas, %.1f s (anios=%.2f)", guardadas, replicas, segundos, anios)
        return {"estado": "listo", "zonas": guardadas, "replicas": replicas, "segundos": round(segundos, 1)}
    finally:
        _recalculo.release()


def recalcular_en_segundo_plano(url: str) -> bool:
    """Lanza el recálculo en un hilo. Devuelve False si ya hay uno en curso."""
    if _recalculo.locked():
        return False

    def tarea() -> None:
        try:
            recalcular(url)
        except SinDatos as error:
            log.info("Recálculo omitido: %s", error)
        except Exception:
            log.exception("Recálculo fallido")

    threading.Thread(target=tarea, name="recalculo", daemon=True).start()
    return True


def hay_analisis(url: str) -> bool:
    t = db.tablas(url)["analisis_zona"]
    with db.motor(url).connect() as c:
        return c.execute(select(func.count()).select_from(t)).scalar_one() > 0


# ─── Resultados guardados ───────────────────────────────────────────────────

def _ultimo_lote(url: str):
    t = db.tablas(url)["analisis_zona"]
    with db.motor(url).connect() as c:
        fecha = c.execute(select(func.max(t.c.fecha_calculo))).scalar()
        if fecha is None:
            return None, []
        filas = c.execute(select(t).where(t.c.fecha_calculo == fecha)).all()
    return fecha, filas


def probabilidades(url: str) -> dict[str, object]:
    cat = catalogo(url)
    corte = fecha_corte(cat)
    fecha, filas = _ultimo_lote(url)
    zonas_resultado = []
    for f in sorted(filas, key=lambda f: -float(f.tasa_anual)):
        a, b = float(f.valor_a), float(f.valor_b)
        zonas_resultado.append({
            "zona": f.zona,
            "agrupadaEn": f.agrupada_en,
            "probabilidades": [
                {"magnitud": m, **{f"anios{t}": round(sismologia.probabilidad_ocurrencia(a, b, m, t), 6) for t in HORIZONTES_ANIOS}}
                for m in MAGNITUDES_PROBABILIDAD
            ],
        })
    return {"fechaCorte": _iso(corte), "fechaCalculo": _iso(fecha) if fecha else None, "zonas": zonas_resultado}


ORDEN_NIVEL = {"ALTA": 0, "ELEVADA": 1, "NORMAL": 2}


def advertencias(url: str, zona: str | None, nivel: str | None) -> dict[str, object]:
    cat = catalogo(url)
    corte = fecha_corte(cat)
    t = db.tablas(url)
    az, adv = t["analisis_zona"], t["advertencia_actividad"]
    fecha, _ = _ultimo_lote(url)
    datos: list[dict[str, object]] = []
    if fecha is not None:
        consulta = select(adv).join(az, az.c.id_analisis == adv.c.id_analisis).where(az.c.fecha_calculo == fecha)
        if zona:
            consulta = consulta.where(adv.c.zona == zona)
        if nivel:
            consulta = consulta.where(adv.c.nivel == nivel)
        with db.motor(url).connect() as c:
            filas = c.execute(consulta).all()
        datos = [{
            "idAdvertencia": f.id_advertencia, "zona": f.zona,
            "ventanaInicio": _iso(f.ventana_inicio), "ventanaFin": _iso(f.ventana_fin),
            "eventosObservados": int(f.eventos_observados), "eventosEsperados": float(f.eventos_esperados),
            "pValor": float(f.p_valor), "nivel": f.nivel, "fechaEmision": _iso(f.fecha_emision),
        } for f in sorted(filas, key=lambda f: (ORDEN_NIVEL.get(f.nivel, 3), float(f.p_valor)))]
    return {"fechaCorte": _iso(corte), "datos": datos}
