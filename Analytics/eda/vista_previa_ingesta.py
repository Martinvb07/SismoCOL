"""Vista previa de la ingesta: procesa un archivo sin escribir en la base.

Muestra el mapeo de columnas, el reporte de validación por fuente y una
muestra de filas normalizadas. Sirve para revisar un archivo antes de cargarlo.

Uso (desde Analytics/):
    .venv/Scripts/python -m eda.vista_previa_ingesta ../data/raw/Sismos_Colombia_FINAL.xlsx
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from sismocol.config import RAIZ_REPO
from sismocol.fuentes.usgs import descargar_eventos
from sismocol.impacto import cargar_reglas
from sismocol.ingest import MAPEO_COLUMNAS, leer_archivo, procesar
from sismocol.municipios import ResolvedorMunicipios

URL_USGS = "https://earthquake.usgs.gov/fdsnws/event/1/query"
URL_DIVIPOLA = "https://www.datos.gov.co/resource/gdxc-w37w.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("archivo", type=Path)
    parser.add_argument("--fuente", choices=["SGC", "UNGRD", "DESINVENTAR", "USGS"])
    parser.add_argument("--sin-usgs", action="store_true", help="No consultar USGS")
    args = parser.parse_args()

    resolvedor = ResolvedorMunicipios.cargar(RAIZ_REPO / "data" / "ref", URL_DIVIPOLA, 120)
    crudo = leer_archivo(args.archivo.read_bytes(), args.archivo.name)
    obtener_usgs = None if args.sin_usgs else (
        lambda ini, fin: descargar_eventos(URL_USGS, ini, fin, 2.5, 120))
    resultado = procesar(crudo, args.archivo.name, resolvedor, cargar_reglas(),
                         fuente_por_defecto=args.fuente, obtener_usgs=obtener_usgs)

    print("\n== Mapeo de columnas (archivo → SismoCol)")
    for canonica in MAPEO_COLUMNAS:
        print(f"  {resultado.mapeo.get(canonica, '—'):<22} → {canonica}")
    print(f"  Ignoradas: {', '.join(resultado.columnas_ignoradas) or 'ninguna'}")

    print(f"\n== Leídas {resultado.leidos} · válidas {resultado.validos} · "
          f"sin fecha {resultado.rechazados_sin_fecha} · sin fuente {resultado.sin_fuente}")
    for r in resultado.por_fuente:
        print(f"\n-- {r.fuente}: leídos {r.leidos}, válidos {r.validos}, epicentro {r.con_epicentro}, "
              f"centroide {r.con_centroide}, con afectación {r.con_afectacion}")
        for motivo, n in r.por_motivo.items():
            print(f"     {motivo}: {n}")

    df = resultado.datos
    assert df is not None
    pd.set_option("display.width", 220)
    pd.set_option("display.max_columns", 30)
    columnas = ["fuente", "id_evento_origen", "fecha_hora", "latitud", "longitud",
                "precision_ubicacion", "profundidad_km", "magnitud", "departamento",
                "municipio", "zona", "nivel_impacto", "motivo_anomalia"]
    print("\n== Muestra")
    print(df.groupby("fuente", group_keys=False).apply(lambda g: g.head(3))[columnas].to_string())
    print("\n== Zonas (válidos)")
    print(df[~df.es_anomalo].zona.value_counts().to_string())
    print("\n== Nivel de impacto (reportes de daño)")
    print(df.nivel_impacto.value_counts(dropna=False).to_string())


if __name__ == "__main__":
    main()
