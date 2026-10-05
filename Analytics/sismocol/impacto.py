"""Construcción de nivel_impacto a partir de las afectaciones reportadas."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from sismocol.config import RAIZ_ANALYTICS

ARCHIVO_UMBRALES = RAIZ_ANALYTICS / "config" / "umbrales_impacto.json"
SIN_AFECTACION = "SIN_AFECTACION"
COLUMNAS_AFECTACION = [
    "fallecidos", "heridos", "desaparecidos", "personas_afectadas",
    "damnificados", "viviendas_destruidas", "viviendas_averiadas",
    "centros_educativos", "centros_salud",
]


@dataclass(frozen=True)
class ReglaNivel:
    nivel: str
    alguna_de: dict[str, float]


def cargar_reglas(ruta: Path = ARCHIVO_UMBRALES) -> list[ReglaNivel]:
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    reglas = [ReglaNivel(r["nivel"], {k: float(v) for k, v in r["alguna_de"].items()})
              for r in datos["niveles"]]
    for regla in reglas:
        desconocidas = set(regla.alguna_de) - set(COLUMNAS_AFECTACION)
        if desconocidas:
            raise ValueError(f"Columnas desconocidas en {ruta.name}: {sorted(desconocidas)}")
    return reglas


def nivel_impacto(afectaciones: pd.DataFrame, reglas: list[ReglaNivel]) -> pd.Series:
    """Nivel por fila. Filas sin ningún dato de afectación quedan en None."""
    con_datos = afectaciones[COLUMNAS_AFECTACION].notna().any(axis=1)
    valores = afectaciones[COLUMNAS_AFECTACION].fillna(0)
    nivel = pd.Series(SIN_AFECTACION, index=afectaciones.index, dtype=object)
    asignado = pd.Series(False, index=afectaciones.index)
    for regla in reglas:
        cumple = np.zeros(len(valores), dtype=bool)
        for columna, umbral in regla.alguna_de.items():
            cumple |= (valores[columna] >= umbral).to_numpy()
        nuevos = cumple & ~asignado.to_numpy()
        nivel[nuevos] = regla.nivel
        asignado |= cumple
    return nivel.where(con_datos, None)
