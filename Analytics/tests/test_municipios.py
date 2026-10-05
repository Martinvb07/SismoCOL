import pytest


@pytest.mark.parametrize("departamento, municipio, codigo", [
    ("Santander", "Los Santos", "68418"),         # exacto
    ("Santander", "LOS SANTOS", "68418"),         # mayúsculas
    ("Santander", "El Carmen", "68235"),          # contención de palabras
    ("Valle del Cauca", "Buga", "76111"),         # nombre popular
    ("Cesar", "Becerrill", "20045"),              # error de tipeo
    ("La Guajira", "Hato Nuevo", "44378"),        # espacios
    ("Bogotá D.C.", "Bogota", "11001"),           # alias
    ("Cundinamarca", "Bogotá", "11001"),          # Bogotá registrada en Cundinamarca
    ("Chocó", "Juradó (Chocó)", "27372"),         # texto entre paréntesis
])
def test_resolver(resolvedor, departamento, municipio, codigo):
    ref = resolvedor.resolver(departamento, municipio)
    assert ref is not None and ref.codigo == codigo


def test_resolver_no_inventa(resolvedor):
    assert resolvedor.resolver("Santander", "Municipio Inexistente") is None
    assert resolvedor.resolver("Santander", None) is None
    assert resolvedor.resolver("Departamento raro", "Los Santos") is None


def test_nombre_oficial(resolvedor):
    assert resolvedor.resolver("Bogotá D.C.", "Bogota").nombre == "Bogotá D.C."
    assert resolvedor.resolver("Santander", "El Carmen").nombre == "El Carmen de Chucurí"


def test_mas_cercano(resolvedor):
    ref, distancia = resolvedor.mas_cercano(4.8836, -76.2182)  # M7.4 Chocó, USGS
    assert ref.nombre == "San José del Palmar" and distancia < 5
    assert resolvedor.mas_cercano(0.0, -95.0) is None  # océano
