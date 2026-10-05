"""Utilidades geográficas."""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

RADIO_TIERRA_KM = 6371.0088

# Caja que contiene el territorio colombiano (incluye San Andrés y aguas cercanas).
BBOX_COLOMBIA = {"lat_min": -4.3, "lat_max": 13.5, "lon_min": -82.0, "lon_max": -66.8}

ArrayF = npt.NDArray[np.float64]


def haversine_km(lat1: ArrayF | float, lon1: ArrayF | float,
                 lat2: ArrayF | float, lon2: ArrayF | float) -> ArrayF:
    """Distancia de gran círculo en km; acepta escalares o arreglos (broadcasting)."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = p2 - p1
    dl = np.radians(lon2) - np.radians(lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * RADIO_TIERRA_KM * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def dentro_de_colombia(lat: ArrayF, lon: ArrayF) -> npt.NDArray[np.bool_]:
    b = BBOX_COLOMBIA
    return (lat >= b["lat_min"]) & (lat <= b["lat_max"]) & (lon >= b["lon_min"]) & (lon <= b["lon_max"])
