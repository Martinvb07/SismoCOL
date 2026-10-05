"""Reportes de emergencias por sismo de la UNGRD (datos.gov.co, API Socrata)."""

from __future__ import annotations

import pandas as pd

from sismocol.fuentes.http import sesion

EVENTO_SISMO = "SISMO"
LIMITE_FILAS = 50000
# Columna Socrata → columna que entiende la ingesta (ver ingest.MAPEO_COLUMNAS).
COLUMNAS = {
    "fecha": "fecha",
    "departamento": "departamento",
    "municipio": "municipio",
    "codificaci_n_segun_divipola": "codigo_divipola",
    "muertos": "fallecidos",
    "heridos": "heridos",
    "desapa": "desaparecidos",
    "personas": "personas_afectadas",
    "viv_destru": "viviendas_destruidas",
    "viv_aver": "viviendas_averiadas",
    "c_educat": "centros_educativos",
    "c_salud": "centros_salud",
}


def descargar_reportes_sismo(url: str, timeout_s: int) -> pd.DataFrame:
    """Todos los reportes con evento SISMO. Fecha como día local (sin hora)."""
    parametros = {
        "$select": ", ".join(COLUMNAS),
        "$where": f"evento = '{EVENTO_SISMO}'",
        "$order": "fecha ASC",
        "$limit": LIMITE_FILAS,
    }
    respuesta = sesion().get(url, params=parametros, timeout=timeout_s)
    respuesta.raise_for_status()
    df = pd.DataFrame(respuesta.json())
    if df.empty:
        return pd.DataFrame(columns=list(COLUMNAS.values()))
    df = df.reindex(columns=list(COLUMNAS)).rename(columns=COLUMNAS)
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce").dt.normalize()
    df["codigo_divipola"] = df["codigo_divipola"].astype(str).str.extract(r"(\d+)")[0].str.zfill(5)
    return df
