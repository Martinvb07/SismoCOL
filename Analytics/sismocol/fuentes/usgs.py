"""Cliente del servicio FDSN de USGS (epicentros con coordenadas reales)."""

from __future__ import annotations

import io

import pandas as pd
import requests

from sismocol.geo import BBOX_COLOMBIA

LIMITE_EVENTOS = 20000  # máximo por consulta del servicio FDSN de USGS


def descargar_eventos(url: str, inicio: pd.Timestamp, fin: pd.Timestamp,
                      magnitud_min: float, timeout_s: int) -> pd.DataFrame:
    """Eventos en el bbox de Colombia entre inicio y fin (UTC). Columnas:
    id, time (UTC ingenuo), latitude, longitude, depth, mag, magType, place."""
    parametros = {
        "format": "csv",
        "starttime": (inicio - pd.Timedelta(minutes=1)).isoformat(),
        "endtime": (fin + pd.Timedelta(minutes=1)).isoformat(),
        "minmagnitude": magnitud_min,
        "minlatitude": BBOX_COLOMBIA["lat_min"],
        "maxlatitude": BBOX_COLOMBIA["lat_max"],
        "minlongitude": BBOX_COLOMBIA["lon_min"],
        "maxlongitude": BBOX_COLOMBIA["lon_max"],
        "orderby": "time-asc",
        "limit": LIMITE_EVENTOS,
    }
    respuesta = requests.get(url, params=parametros, timeout=timeout_s)
    if respuesta.status_code == 204 or not respuesta.text.strip():
        return pd.DataFrame(columns=["id", "time", "latitude", "longitude", "depth", "mag",
                                     "magType", "place"])
    respuesta.raise_for_status()
    df = pd.read_csv(io.StringIO(respuesta.text))
    df["time"] = pd.to_datetime(df["time"], utc=True).dt.tz_localize(None)
    return df[["id", "time", "latitude", "longitude", "depth", "mag", "magType", "place"]]
