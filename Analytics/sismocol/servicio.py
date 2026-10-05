"""Orquestación: ingesta de archivos y sincronización con fuentes en línea."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import numpy as np
import pandas as pd

from sismocol import db
from sismocol.config import Ajustes
from sismocol.fuentes.ungrd import descargar_reportes_sismo
from sismocol.fuentes.usgs import descargar_eventos
from sismocol.geo import haversine_km
from sismocol.impacto import ReglaNivel, cargar_reglas
from sismocol.ingest import ErrorIngesta, ResultadoIngesta, leer_archivo, procesar
from sismocol.municipios import ResolvedorMunicipios
from sismocol.territorio import normalizar_departamento

log = logging.getLogger("sismocol.servicio")

# Asociación de un reporte de daño UNGRD con el sismo que lo causó.
ASOCIACION_DIAS = 1
ASOCIACION_MAX_KM = 150.0
ASOCIACION_MAGNITUD_MIN = 3.0
SOLAPE_SINCRONIZACION = timedelta(days=1)


_resolvedores: dict[str, ResolvedorMunicipios] = {}


def resolvedor(ajustes: Ajustes) -> ResolvedorMunicipios:
    """DIVIPOLA cargada una sola vez por proceso."""
    llave = str(ajustes.dir_referencias)
    if llave not in _resolvedores:
        _resolvedores[llave] = ResolvedorMunicipios.cargar(
            ajustes.dir_referencias, ajustes.url_divipola, ajustes.http_timeout_s)
    return _resolvedores[llave]


@lru_cache
def reglas() -> list[ReglaNivel]:
    return cargar_reglas()


def _obtener_usgs(ajustes: Ajustes):
    return lambda inicio, fin: descargar_eventos(ajustes.url_usgs, inicio, fin,
                                                 ajustes.usgs_magnitud_min, ajustes.http_timeout_s)


def resumen(resultado: ResultadoIngesta, guardadas: list[db.CargaGuardada]) -> dict[str, object]:
    """Reporte con la forma de ReporteCarga del contrato (docs/api-contrato.md)."""
    por_id = {g.fuente: g for g in guardadas}
    return {
        "leidos": resultado.leidos,
        "validos": resultado.validos,
        "rechazadosSinFecha": resultado.rechazados_sin_fecha,
        "mapeo": resultado.mapeo,
        "columnasIgnoradas": resultado.columnas_ignoradas,
        "avisos": resultado.avisos,
        "porFuente": [
            {
                "fuente": r.fuente, "leidos": r.leidos, "validos": r.validos,
                "nuevos": por_id[r.fuente].nuevos if r.fuente in por_id else 0,
                "existentes": por_id[r.fuente].existentes if r.fuente in por_id else 0,
                "porMotivo": r.por_motivo, "conEpicentro": r.con_epicentro,
                "conCentroide": r.con_centroide, "conAfectacion": r.con_afectacion,
            }
            for r in resultado.por_fuente
        ],
    }


def ingerir_archivo(ajustes: Ajustes, contenido: bytes, nombre: str, *, id_usuario: int | None,
                    fuente: str | None, zona_horaria: str | None) -> dict[str, object]:
    """Procesa y guarda un archivo. Lanza ErrorIngesta si se rechaza (y lo registra)."""
    try:
        crudo = leer_archivo(contenido, nombre)
        resultado = procesar(crudo, nombre, resolvedor(ajustes), reglas(),
                             fuente_por_defecto=fuente, zona_horaria=zona_horaria,
                             obtener_usgs=_obtener_usgs(ajustes))
        if resultado.datos is None or resultado.datos.empty:
            raise ErrorIngesta("El archivo no tiene filas con fecha válida.")
    except ErrorIngesta:
        db.registrar_rechazo(ajustes.database_url, nombre, fuente or "SGC", id_usuario, "ARCHIVO",
                             leidos=0)
        raise
    guardadas = db.guardar_ingesta(ajustes.database_url, resultado, id_usuario, "ARCHIVO",
                                   ajustes.tamano_lote_insercion)
    return {"idsCarga": [g.id_carga for g in guardadas], "reporte": resumen(resultado, guardadas)}


# ─── Sincronización con USGS ────────────────────────────────────────────────

def sincronizar_usgs(ajustes: Ajustes) -> list[db.CargaGuardada]:
    """Trae eventos USGS posteriores al último sismo del SGC (antes de esa fecha
    el catálogo SGC ya los contiene y USGS solo sirve para epicentros)."""
    url = ajustes.database_url
    fin_sgc = db.ultima_fecha(url, "SGC")
    ultimo_usgs = db.ultima_fecha(url, "USGS")
    referencias = [f for f in (fin_sgc, ultimo_usgs) if f is not None]
    if not referencias:
        log.info("Sincronización USGS omitida: no hay catálogo base cargado.")
        return []
    inicio = max(referencias) - SOLAPE_SINCRONIZACION
    if fin_sgc is not None:
        inicio = max(inicio, fin_sgc)
    ahora = pd.Timestamp(datetime.now(timezone.utc).replace(tzinfo=None))
    eventos = descargar_eventos(ajustes.url_usgs, pd.Timestamp(inicio), ahora,
                                ajustes.usgs_magnitud_min, ajustes.http_timeout_s)
    if fin_sgc is not None:
        eventos = eventos[eventos.time > pd.Timestamp(fin_sgc)]
    if eventos.empty:
        return []
    crudo = pd.DataFrame({
        "id_evento": eventos["id"], "fecha": eventos["time"], "latitud": eventos["latitude"],
        "longitud": eventos["longitude"], "profundidad_km": eventos["depth"],
        "magnitud": eventos["mag"], "tipo_magnitud": eventos["magType"],
    })
    nombre = f"USGS FDSN {inicio:%Y-%m-%d} a {ahora:%Y-%m-%d}"
    resultado = procesar(crudo, nombre, resolvedor(ajustes), reglas(),
                         fuente_por_defecto="USGS", zona_horaria="UTC")
    return db.guardar_ingesta(url, resultado, None, "API", ajustes.tamano_lote_insercion)


# ─── Sincronización con UNGRD ───────────────────────────────────────────────

def _asociar_sismos(reportes: pd.DataFrame, eventos: pd.DataFrame,
                    res: ResolvedorMunicipios) -> pd.DataFrame:
    """Asigna a cada reporte el sismo de mayor magnitud a ≤ 150 km del municipio y
    ±1 día de la fecha del reporte. Sin sismo asociado, magnitud y profundidad quedan vacías."""
    reportes = reportes.copy()
    reportes["magnitud"] = np.nan
    reportes["profundidad_km"] = np.nan
    if eventos.empty:
        return reportes
    for i, fila in reportes.iterrows():
        municipio = res.resolver(normalizar_departamento(fila.departamento), fila.municipio)
        if municipio is None or pd.isna(fila.fecha):
            continue
        dia_utc = pd.Timestamp(fila.fecha).tz_localize("America/Bogota").tz_convert("UTC").tz_localize(None)
        ventana = eventos[eventos.fecha_hora.between(dia_utc - timedelta(days=ASOCIACION_DIAS),
                                                     dia_utc + timedelta(days=1 + ASOCIACION_DIAS))]
        if ventana.empty:
            continue
        distancia = haversine_km(municipio.latitud, municipio.longitud,
                                 ventana.latitud.to_numpy(float), ventana.longitud.to_numpy(float))
        cercanos = ventana[distancia <= ASOCIACION_MAX_KM]
        if cercanos.empty:
            continue
        sismo = cercanos.loc[cercanos.magnitud.idxmax()]
        reportes.at[i, "magnitud"] = sismo.magnitud
        reportes.at[i, "profundidad_km"] = sismo.profundidad_km
    return reportes


def sincronizar_ungrd(ajustes: Ajustes) -> list[db.CargaGuardada]:
    reportes = descargar_reportes_sismo(ajustes.url_ungrd, ajustes.http_timeout_s)
    reportes = reportes[reportes.fecha.notna()]
    if reportes.empty:
        return []
    eventos = db.eventos_entre(
        ajustes.database_url,
        reportes.fecha.min() - timedelta(days=ASOCIACION_DIAS + 1),
        reportes.fecha.max() + timedelta(days=ASOCIACION_DIAS + 2),
        ASOCIACION_MAGNITUD_MIN,
    )
    reportes = _asociar_sismos(reportes, eventos, resolvedor(ajustes))
    reportes["id_evento"] = reportes.fecha.dt.strftime("%Y%m%d") + "-" + reportes.codigo_divipola
    reportes = reportes.drop(columns=["codigo_divipola"])
    nombre = f"UNGRD datos.gov.co ({len(reportes)} reportes de sismo)"
    resultado = procesar(reportes, nombre, resolvedor(ajustes), reglas(),
                         fuente_por_defecto="UNGRD", zona_horaria="America/Bogota")
    return db.guardar_ingesta(ajustes.database_url, resultado, None, "API",
                              ajustes.tamano_lote_insercion)


def sincronizar(ajustes: Ajustes) -> dict[str, object]:
    """Sincroniza todas las fuentes en línea. Un fallo en una no detiene la otra."""
    ids: list[int] = []
    errores: list[str] = []
    for nombre, tarea in (("USGS", sincronizar_usgs), ("UNGRD", sincronizar_ungrd)):
        try:
            ids += [g.id_carga for g in tarea(ajustes)]
        except Exception as error:
            log.exception("Sincronización %s fallida", nombre)
            errores.append(f"{nombre}: {type(error).__name__}")
    return {"idsCarga": ids, "errores": errores}
