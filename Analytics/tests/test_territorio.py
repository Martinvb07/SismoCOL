import pytest

from sismocol.territorio import ZONA_NIDO_BUCARAMANGA, normalizar_departamento, region_de, zona_de


@pytest.mark.parametrize("texto, esperado", [
    ("CHOCO", "Chocó"),
    ("Chocó", "Chocó"),
    ("la Guajira", "La Guajira"),
    ("Quindio", "Quindío"),
    ("Bogotá D.C.", "Bogotá D.C."),
    ("BOGOTÁ, D.C.", "Bogotá D.C."),
    ("San Andrés Providencia", "San Andrés y Providencia"),
    ("NORTE DE SANTANDER", "Norte de Santander"),
    ("Carchi, Ecuador", None),
    ("PERÚ", None),
    ("", None),
    (None, None),
])
def test_normalizar_departamento(texto, esperado):
    assert normalizar_departamento(texto) == esperado


def test_zona_nido_solo_santander_profundo():
    assert zona_de("Santander", 145.0) == ZONA_NIDO_BUCARAMANGA
    assert zona_de("Santander", 30.0) == "Santander"
    assert zona_de("Santander", None) == "Santander"
    assert zona_de("Norte de Santander", 145.0) == "Norte de Santander"
    assert zona_de(None, 145.0) is None


def test_regiones():
    assert region_de("Chocó") == "Pacífica"
    assert region_de("Meta") == "Orinoquía"
    assert region_de("Guaviare") == "Amazonía"
