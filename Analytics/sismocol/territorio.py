"""Normalización territorial: departamentos, regiones naturales y zonas de análisis.

Las fuentes escriben los departamentos de muchas formas ("CHOCO", "Chocó",
"la Guajira", "Bogotá D.C."). Todo se reduce a una clave sin tildes ni
mayúsculas y se traduce al nombre canónico.
"""

from __future__ import annotations

import re
import unicodedata

# Nombre canónico → región natural. La región se usa para agrupar zonas con
# menos de `min_eventos_zona` eventos al estimar Gutenberg-Richter.
REGION_POR_DEPARTAMENTO: dict[str, str] = {
    # Andina
    "Antioquia": "Andina",
    "Bogotá D.C.": "Andina",
    "Boyacá": "Andina",
    "Caldas": "Andina",
    "Cundinamarca": "Andina",
    "Huila": "Andina",
    "Norte de Santander": "Andina",
    "Quindío": "Andina",
    "Risaralda": "Andina",
    "Santander": "Andina",
    "Tolima": "Andina",
    # Caribe (San Andrés se incluye aquí por cercanía)
    "Atlántico": "Caribe",
    "Bolívar": "Caribe",
    "Cesar": "Caribe",
    "Córdoba": "Caribe",
    "La Guajira": "Caribe",
    "Magdalena": "Caribe",
    "San Andrés y Providencia": "Caribe",
    "Sucre": "Caribe",
    # Pacífica
    "Cauca": "Pacífica",
    "Chocó": "Pacífica",
    "Nariño": "Pacífica",
    "Valle del Cauca": "Pacífica",
    # Orinoquía
    "Arauca": "Orinoquía",
    "Casanare": "Orinoquía",
    "Meta": "Orinoquía",
    "Vichada": "Orinoquía",
    # Amazonía
    "Amazonas": "Amazonía",
    "Caquetá": "Amazonía",
    "Guainía": "Amazonía",
    "Guaviare": "Amazonía",
    "Putumayo": "Amazonía",
    "Vaupés": "Amazonía",
}

# Zona especial: sismicidad de profundidad intermedia bajo Santander.
ZONA_NIDO_BUCARAMANGA = "Nido de Bucaramanga"
NIDO_DEPARTAMENTO = "Santander"
NIDO_PROFUNDIDAD_MIN_KM = 100.0


def clave(texto: str) -> str:
    """Minúsculas, sin tildes, sin texto entre paréntesis y con espacios simples."""
    sin_parentesis = re.sub(r"\(.*?\)", " ", texto)
    descompuesto = unicodedata.normalize("NFKD", sin_parentesis)
    sin_tildes = "".join(c for c in descompuesto if not unicodedata.combining(c))
    limpio = re.sub(r"[^a-z0-9 ]", " ", sin_tildes.lower())
    return re.sub(r"\s+", " ", limpio).strip()


_ALIAS: dict[str, str] = {
    "bogota": "Bogotá D.C.",
    "bogota d c": "Bogotá D.C.",
    "bogota dc": "Bogotá D.C.",
    "santafe de bogota d c": "Bogotá D.C.",
    "guajira": "La Guajira",
    "san andres": "San Andrés y Providencia",
    "san andres providencia": "San Andrés y Providencia",
    "archipielago de san andres providencia y santa catalina": "San Andrés y Providencia",
    "valle": "Valle del Cauca",
}

_CANONICO_POR_CLAVE: dict[str, str] = {
    **{clave(nombre): nombre for nombre in REGION_POR_DEPARTAMENTO},
    **_ALIAS,
}


def normalizar_departamento(texto: object) -> str | None:
    """Devuelve el nombre canónico o None si no es un departamento colombiano."""
    if not isinstance(texto, str) or not texto.strip():
        return None
    return _CANONICO_POR_CLAVE.get(clave(texto))


def region_de(departamento: str) -> str | None:
    return REGION_POR_DEPARTAMENTO.get(departamento)


def zona_de(departamento: str | None, profundidad_km: float | None) -> str | None:
    """Zona de análisis: el departamento, salvo el Nido de Bucaramanga."""
    if departamento is None:
        return None
    if (
        departamento == NIDO_DEPARTAMENTO
        and profundidad_km is not None
        and profundidad_km > NIDO_PROFUNDIDAD_MIN_KM
    ):
        return ZONA_NIDO_BUCARAMANGA
    return departamento
