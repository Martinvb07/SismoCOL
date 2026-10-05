"""Configuración del servicio analítico, leída de Analytics/.env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ_ANALYTICS = Path(__file__).resolve().parent.parent
RAIZ_REPO = RAIZ_ANALYTICS.parent


class Ajustes(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=RAIZ_ANALYTICS / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = Field(pattern=r"^mysql\+pymysql://")
    analytics_token: str = Field(min_length=32)
    zona_horaria: str = "America/Bogota"

    # Datos de referencia (se descargan si faltan)
    dir_referencias: Path = RAIZ_REPO / "data" / "ref"
    url_divipola: str = "https://www.datos.gov.co/resource/gdxc-w37w.json"

    # Fuentes en línea
    url_usgs: str = "https://earthquake.usgs.gov/fdsnws/event/1/query"
    usgs_magnitud_min: float = 2.5
    url_ungrd: str = "https://www.datos.gov.co/resource/2343-nuqp.json"
    http_timeout_s: int = 120

    # Ingesta
    tamano_lote_insercion: int = Field(default=2000, ge=100, le=20000)
    max_mb_archivo: float = Field(default=25, gt=0, le=100)


@lru_cache
def ajustes() -> Ajustes:
    return Ajustes()  # type: ignore[call-arg]
