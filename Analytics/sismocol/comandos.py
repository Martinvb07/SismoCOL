"""Comandos de administración del servicio analítico.

    python -m sismocol.comandos usgs-historico [--desde 1973]
"""

from __future__ import annotations

import argparse
import logging

from sismocol import servicio
from sismocol.config import ajustes


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    analizador = argparse.ArgumentParser(prog="python -m sismocol.comandos")
    sub = analizador.add_subparsers(dest="comando", required=True)
    hist = sub.add_parser("usgs-historico", help="Sincroniza el catálogo USGS M ≥ 4,5 desde 1973 (USGS_HIST)")
    hist.add_argument("--desde", type=int, default=None, help="Año inicial (por defecto: incremental)")
    args = analizador.parse_args(argv)

    if args.comando == "usgs-historico":
        guardadas = servicio.sincronizar_usgs_historico(ajustes(), args.desde)
        for g in guardadas:
            print(f"Carga {g.id_carga} ({g.fuente}): {g.nuevos} nuevos, {g.existentes} existentes")


if __name__ == "__main__":
    main()
