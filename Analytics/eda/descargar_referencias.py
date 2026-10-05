"""Descarga los datos de referencia que usa el barrido (no se versionan).

- DIVIPOLA de municipios con centroides (datos.gov.co, gdxc-w37w).
- Catálogo USGS FDSN de M ≥ 2,5 en el bbox de Colombia.

Uso (desde Analytics/):
    .venv/Scripts/python -m eda.descargar_referencias --destino ../data/ref
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta
from pathlib import Path

import requests

URL_DIVIPOLA = "https://www.datos.gov.co/resource/gdxc-w37w.json"
URL_USGS = "https://earthquake.usgs.gov/fdsnws/event/1/query"
BBOX = {"minlatitude": -4.3, "maxlatitude": 13.5, "minlongitude": -82.0, "maxlongitude": -66.8}
INICIO_CATALOGO = "2022-11-01"
MAGNITUD_MIN_USGS = 2.5
TIMEOUT_S = 120


def descargar(url: str, params: dict[str, object], destino: Path) -> None:
    respuesta = requests.get(url, params=params, timeout=TIMEOUT_S)
    respuesta.raise_for_status()
    destino.write_bytes(respuesta.content)
    print(f"{destino.name}: {len(respuesta.content) / 1024:.0f} KB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--destino", type=Path, required=True)
    args = parser.parse_args()
    args.destino.mkdir(parents=True, exist_ok=True)

    descargar(URL_DIVIPOLA, {"$limit": 5000}, args.destino / "divipola_municipios.json")
    descargar(
        URL_USGS,
        {
            "format": "csv",
            "starttime": INICIO_CATALOGO,
            "endtime": (date.today() + timedelta(days=1)).isoformat(),
            "minmagnitude": MAGNITUD_MIN_USGS,
            "orderby": "time-asc",
            **BBOX,
        },
        args.destino / "usgs_colombia_m25.csv",
    )


if __name__ == "__main__":
    main()
