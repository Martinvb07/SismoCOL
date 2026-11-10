"""Cliente del servicio FDSN de USGS (epicentros con coordenadas reales).

- `descargar_eventos`: eventos recientes M ≥ 2,5 para enriquecer el catálogo SGC.
- `descargar_historico`: catálogo M ≥ 4,5 desde 1973, paginado por año, que se
  guarda como fuente USGS_HIST sin mezclarse con el SGC (decisión D14).
"""

from __future__ import annotations

import io
import logging

import pandas as pd

from sismocol.fuentes.http import sesion
from sismocol.geo import BBOX_COLOMBIA, BBOX_HISTORICO

log = logging.getLogger("sismocol.fuentes.usgs")

LIMITE_EVENTOS = 20000  # máximo por consulta del servicio FDSN de USGS
COLUMNAS = ["id", "time", "latitude", "longitude", "depth", "mag", "magType", "place"]


def _consultar(url: str, inicio: pd.Timestamp, fin: pd.Timestamp, magnitud_min: float,
               bbox: dict[str, float], timeout_s: int) -> pd.DataFrame:
    parametros = {
        "format": "csv",
        "starttime": inicio.isoformat(),
        "endtime": fin.isoformat(),
        "minmagnitude": magnitud_min,
        "minlatitude": bbox["lat_min"],
        "maxlatitude": bbox["lat_max"],
        "minlongitude": bbox["lon_min"],
        "maxlongitude": bbox["lon_max"],
        "orderby": "time-asc",
        "limit": LIMITE_EVENTOS,
    }
    respuesta = sesion().get(url, params=parametros, timeout=timeout_s)
    if respuesta.status_code == 204 or not respuesta.text.strip():
        return pd.DataFrame(columns=COLUMNAS)
    respuesta.raise_for_status()
    df = pd.read_csv(io.StringIO(respuesta.text))
    if df.empty:
        return pd.DataFrame(columns=COLUMNAS)
    df["time"] = pd.to_datetime(df["time"], utc=True, format="ISO8601").dt.tz_localize(None)
    return df[COLUMNAS]


def descargar_eventos(url: str, inicio: pd.Timestamp, fin: pd.Timestamp,
                      magnitud_min: float, timeout_s: int) -> pd.DataFrame:
    """Eventos en el bbox de Colombia entre inicio y fin (UTC). Columnas:
    id, time (UTC ingenuo), latitude, longitude, depth, mag, magType, place."""
    return _consultar(url, inicio - pd.Timedelta(minutes=1), fin + pd.Timedelta(minutes=1),
                      magnitud_min, BBOX_COLOMBIA, timeout_s)


def descargar_historico(url: str, anio_inicio: int, anio_fin: int, magnitud_min: float,
                        timeout_s: int) -> pd.DataFrame:
    """Catálogo M ≥ magnitud_min en BBOX_HISTORICO, una consulta por año
    (así ninguna supera el límite de eventos del servicio). Sin duplicados por id."""
    if anio_fin < anio_inicio:
        return pd.DataFrame(columns=COLUMNAS)
    partes = []
    for anio in range(anio_inicio, anio_fin + 1):
        parte = _consultar(url, pd.Timestamp(f"{anio}-01-01"), pd.Timestamp(f"{anio + 1}-01-01"),
                           magnitud_min, BBOX_HISTORICO, timeout_s)
        if len(parte) >= LIMITE_EVENTOS:
            raise RuntimeError(f"USGS devolvió el máximo de eventos para {anio}; reduzca el intervalo")
        log.info("USGS histórico %d: %d eventos", anio, len(parte))
        partes.append(parte)
    df = pd.concat([p for p in partes if not p.empty], ignore_index=True) if any(len(p) for p in partes) \
        else pd.DataFrame(columns=COLUMNAS)
    # El límite superior de un año es el inferior del siguiente: un evento justo en 00:00 llega dos veces.
    return df.drop_duplicates(subset="id").reset_index(drop=True)
