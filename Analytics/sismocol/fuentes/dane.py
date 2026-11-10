"""Datos municipales del DANE para el modelo de impacto (fase 5 de la analítica).

- Población: proyecciones municipales por área 2018-2042 (PPED, base CNPV 2018).
  Se usa el año 2018 (año del censo) para entrenar y para predecir, y el % de
  población en cabecera municipal como indicador de urbanización.
- Vulnerabilidad de vivienda: anexo del déficit habitacional CNPV 2018 (nueva
  metodología 2020). Indicador: % de hogares con carencia por material de
  paredes (paredes exteriores inadecuadas) sobre el total de hogares.

La densidad (hab/km²) no se calcula: el área municipal (MGN) no se pudo
descargar de una fuente accesible (D18).
Los archivos se guardan en data/ref y solo se descargan si faltan.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from sismocol.fuentes.http import sesion

URL_POBLACION = "https://www.dane.gov.co/files/censo2018/proyecciones-de-poblacion/Municipal/PPED-AreaMun-2018-2042_VP.xlsx"
URL_DEFICIT = "https://www.dane.gov.co/files/investigaciones/deficit-habitacional/deficit-hab-2020-anexo-nueva-metodologia.xlsx"
ARCHIVO_POBLACION = "dane_poblacion_municipal_2018_2042.xlsx"
ARCHIVO_DEFICIT = "dane_deficit_habitacional_cnpv2018.xlsx"
HOJA_POBLACION = "PobMunicipalxÁrea"
HOJA_DEFICIT = "Total Municipios"
ANIO_POBLACION = 2018


def _archivo(dir_referencias: Path, nombre: str, url: str, timeout_s: int) -> Path:
    ruta = dir_referencias / nombre
    if not ruta.exists():
        respuesta = sesion().get(url, timeout=timeout_s)
        respuesta.raise_for_status()
        dir_referencias.mkdir(parents=True, exist_ok=True)
        ruta.write_bytes(respuesta.content)
    return ruta


def _tabla(ruta: Path, hoja: str, primera_columna: str) -> pd.DataFrame:
    """Lee una hoja con encabezados decorativos: la fila de títulos es la que empieza por `primera_columna`."""
    crudo = pd.read_excel(ruta, sheet_name=hoja, header=None, dtype=str)
    fila = crudo.index[crudo.iloc[:, 0].astype(str).str.strip() == primera_columna][0]
    tabla = crudo.iloc[fila + 1:].copy()
    tabla.columns = [str(c).strip() for c in crudo.iloc[fila]]
    return tabla.dropna(how="all")


def leer_poblacion(ruta: Path, anio: int = ANIO_POBLACION) -> pd.DataFrame:
    """codigo (5 dígitos), poblacion, pct_urbano (cabecera / total, en %)."""
    t = _tabla(ruta, HOJA_POBLACION, "DP")
    t = t[t["AÑO"].astype(str).str.strip().str[:4] == str(anio)]
    t["codigo"] = t["MPIO"].astype(str).str.extract(r"(\d+)")[0].str.zfill(5)
    t["valor"] = pd.to_numeric(t["TOTAL"], errors="coerce")
    area = t["ÁREA GEOGRÁFICA"].astype(str).str.lower()
    total = t[area.str.startswith("total")].set_index("codigo")["valor"]
    cabecera = t[area.str.startswith("cabecera")].set_index("codigo")["valor"]
    df = pd.DataFrame({"poblacion": total, "pct_urbano": (cabecera / total * 100).reindex(total.index)})
    return df.dropna(subset=["poblacion"]).reset_index()


def leer_vulnerabilidad(ruta: Path) -> pd.DataFrame:
    """codigo, pct_paredes_inadecuadas, pct_deficit_cuantitativo (en %)."""
    t = _tabla(ruta, HOJA_DEFICIT, "Departamento")
    t["codigo"] = t["Municipio"].astype(str).str.extract(r"(\d+)")[0].str.zfill(5)
    hogares = pd.to_numeric(t["Total de hogares"], errors="coerce")
    paredes = pd.to_numeric(t["Material de Paredes"], errors="coerce")
    df = pd.DataFrame({
        "codigo": t["codigo"],
        "pct_paredes_inadecuadas": paredes / hogares * 100,
        "pct_deficit_cuantitativo": pd.to_numeric(t["Déficit cuantitativo"], errors="coerce"),
    })
    return df.dropna(subset=["codigo"]).drop_duplicates("codigo").reset_index(drop=True)


def cargar(dir_referencias: Path, timeout_s: int) -> tuple[pd.DataFrame | None, pd.DataFrame | None, list[str]]:
    """(población, vulnerabilidad, avisos). Si una fuente no se puede descargar, queda en None."""
    avisos: list[str] = []
    poblacion = vulnerabilidad = None
    try:
        poblacion = leer_poblacion(_archivo(dir_referencias, ARCHIVO_POBLACION, URL_POBLACION, timeout_s))
    except Exception as error:
        avisos.append(f"Población DANE no disponible ({type(error).__name__})")
    try:
        vulnerabilidad = leer_vulnerabilidad(_archivo(dir_referencias, ARCHIVO_DEFICIT, URL_DEFICIT, timeout_s))
    except Exception as error:
        avisos.append(f"Déficit habitacional DANE no disponible ({type(error).__name__})")
    return poblacion, vulnerabilidad, avisos
