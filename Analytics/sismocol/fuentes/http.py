"""Sesión HTTP con reintentos para las fuentes en línea."""

from __future__ import annotations

from functools import lru_cache

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

REINTENTOS = 3
FACTOR_ESPERA_S = 2.0
ESTADOS_REINTENTABLES = (429, 500, 502, 503, 504)
AGENTE = "SismoCol/0.2 (proyecto academico; Universidad Cooperativa de Colombia)"


@lru_cache
def sesion() -> requests.Session:
    s = requests.Session()
    reintentos = Retry(total=REINTENTOS, connect=REINTENTOS, read=REINTENTOS,
                       backoff_factor=FACTOR_ESPERA_S, status_forcelist=ESTADOS_REINTENTABLES,
                       allowed_methods=("GET",))
    s.mount("https://", HTTPAdapter(max_retries=reintentos))
    s.mount("http://", HTTPAdapter(max_retries=reintentos))
    s.headers["User-Agent"] = AGENTE
    return s
