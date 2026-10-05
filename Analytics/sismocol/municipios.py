"""Resolución de municipios contra la DIVIPOLA del DANE.

Convierte (departamento, municipio) escritos libremente en el municipio oficial
con su centroide (cabecera municipal), y hace la operación inversa para
coordenadas: el municipio más cercano.
"""

from __future__ import annotations

import difflib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from sismocol.geo import haversine_km
from sismocol.territorio import clave, normalizar_departamento

ARCHIVO_DIVIPOLA = "divipola_municipios.json"
SIMILITUD_MINIMA = 0.85
# Distancia máxima para asignar municipio a un epicentro (más lejos = mar o país vecino).
DISTANCIA_MAX_MUNICIPIO_KM = 60.0

# Nombres populares → clave del nombre oficial DIVIPOLA, por departamento.
# Solo hacen falta cuando la contención de palabras o la similitud no bastan.
ALIAS_MUNICIPIO: dict[tuple[str, str], str] = {
    ("Bogotá D.C.", "bogota"): "bogota d c",
    ("Bogotá D.C.", "santafe de bogota"): "bogota d c",
    ("Bolívar", "cartagena"): "cartagena de indias",
    ("Bolívar", "mompos"): "santa cruz de mompox",
    ("Boyacá", "pisva"): "pisba",
    ("Antioquia", "meceo"): "maceo",
    ("San Andrés y Providencia", "san andres y providencia"): "providencia",
}

# Algunas fuentes registran Bogotá dentro de Cundinamarca.
DEPARTAMENTO_REAL: dict[tuple[str, str], str] = {
    ("Cundinamarca", "bogota"): "Bogotá D.C.",
    ("Cundinamarca", "bogota d c"): "Bogotá D.C.",
}

_PARTICULAS = {"de", "del", "la", "las", "los", "el", "y", "e"}


def nombre_propio(texto: str) -> str:
    """'SAN JOSÉ DE CÚCUTA' → 'San José de Cúcuta'."""
    palabras = texto.strip().lower().split()
    return " ".join(
        "D.C." if p == "d.c." else p if (i > 0 and p in _PARTICULAS) else p[:1].upper() + p[1:]
        for i, p in enumerate(palabras)
    )


@dataclass(frozen=True)
class Municipio:
    codigo: str
    nombre: str
    departamento: str
    latitud: float
    longitud: float


class ResolvedorMunicipios:
    def __init__(self, registros: list[dict[str, str]]) -> None:
        filas = []
        for r in registros:
            departamento = normalizar_departamento(r.get("dpto", ""))
            if departamento is None:
                continue
            filas.append({
                "codigo": r["cod_mpio"],
                "nombre": nombre_propio(r["nom_mpio"].replace(", D.C.", " D.C.")),
                "departamento": departamento,
                "clave": clave(r["nom_mpio"]),
                "latitud": float(str(r["latitud"]).replace(",", ".")),
                "longitud": float(str(r["longitud"]).replace(",", ".")),
            })
        self._df = pd.DataFrame(filas)
        self._por_depto: dict[str, pd.DataFrame] = {
            d: g.reset_index(drop=True) for d, g in self._df.groupby("departamento")
        }
        self._cache: dict[tuple[str | None, str], Municipio | None] = {}

    @classmethod
    def desde_archivo(cls, ruta: Path) -> "ResolvedorMunicipios":
        return cls(json.loads(ruta.read_text(encoding="utf-8")))

    @classmethod
    def cargar(cls, dir_referencias: Path, url: str, timeout_s: int) -> "ResolvedorMunicipios":
        """Lee la DIVIPOLA en caché o la descarga de datos.gov.co si no existe."""
        ruta = dir_referencias / ARCHIVO_DIVIPOLA
        if not ruta.exists():
            respuesta = requests.get(url, params={"$limit": 5000}, timeout=timeout_s)
            respuesta.raise_for_status()
            dir_referencias.mkdir(parents=True, exist_ok=True)
            ruta.write_bytes(respuesta.content)
        return cls.desde_archivo(ruta)

    def __len__(self) -> int:
        return len(self._df)

    @staticmethod
    def _a_municipio(fila: pd.Series) -> Municipio:
        return Municipio(fila.codigo, fila.nombre, fila.departamento,
                         float(fila.latitud), float(fila.longitud))

    def resolver(self, departamento: str | None, municipio: object) -> Municipio | None:
        """Municipio oficial para un (departamento canónico, nombre libre), o None."""
        if not isinstance(municipio, str) or not municipio.strip():
            return None
        k = clave(municipio)
        llave = (departamento, k)
        if llave not in self._cache:
            self._cache[llave] = self._resolver(departamento, k)
        return self._cache[llave]

    def _resolver(self, departamento: str | None, k: str) -> Municipio | None:
        if departamento is None:
            # Sin departamento solo se acepta un nombre que exista una única vez en el país.
            exactos = self._df[self._df.clave == k]
            return self._a_municipio(exactos.iloc[0]) if len(exactos) == 1 else None

        departamento = DEPARTAMENTO_REAL.get((departamento, k), departamento)
        candidatos = self._por_depto.get(departamento)
        if candidatos is None:
            return None
        k = ALIAS_MUNICIPIO.get((departamento, k), k)

        # 1. Coincidencia exacta, con o sin espacios ("hato nuevo" = "hatonuevo").
        sin_espacios = k.replace(" ", "")
        exacto = candidatos[(candidatos.clave == k) | (candidatos.clave.str.replace(" ", "") == sin_espacios)]
        if len(exacto) == 1:
            return self._a_municipio(exacto.iloc[0])

        # 2. Contención de palabras ("buga" ⊂ "guadalajara de buga").
        palabras = set(k.split()) - _PARTICULAS
        if palabras:
            contienen = candidatos[candidatos.clave.map(lambda c: palabras <= set(c.split()))]
            if len(contienen) == 1:
                return self._a_municipio(contienen.iloc[0])
            if len(contienen) > 1:
                mejor = max(contienen.itertuples(),
                            key=lambda f: difflib.SequenceMatcher(None, k, f.clave).ratio())
                return self._a_municipio(pd.Series(mejor._asdict()))

        # 3. Similitud de texto (errores de tipeo: "becerrill").
        parecidos = difflib.get_close_matches(k, candidatos.clave.tolist(), n=1, cutoff=SIMILITUD_MINIMA)
        if parecidos:
            return self._a_municipio(candidatos[candidatos.clave == parecidos[0]].iloc[0])
        return None

    def mas_cercano(self, lat: float, lon: float,
                    max_km: float = DISTANCIA_MAX_MUNICIPIO_KM) -> tuple[Municipio, float] | None:
        """Municipio cuya cabecera está más cerca del punto, si está a menos de max_km."""
        d = haversine_km(lat, lon, self._df.latitud.to_numpy(), self._df.longitud.to_numpy())
        i = int(np.argmin(d))
        if d[i] > max_km:
            return None
        return self._a_municipio(self._df.iloc[i]), float(d[i])
