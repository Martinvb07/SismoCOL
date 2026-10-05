import pytest

from sismocol.impacto import cargar_reglas
from sismocol.municipios import ResolvedorMunicipios

# Subconjunto de la DIVIPOLA con el mismo formato que datos.gov.co (coma decimal).
DIVIPOLA_PRUEBA = [
    {"cod_dpto": "68", "dpto": "SANTANDER", "cod_mpio": "68418", "nom_mpio": "LOS SANTOS",
     "latitud": "6,755203", "longitud": "-73,102739"},
    {"cod_dpto": "68", "dpto": "SANTANDER", "cod_mpio": "68235", "nom_mpio": "EL CARMEN DE CHUCURÍ",
     "latitud": "6,698500", "longitud": "-73,511200"},
    {"cod_dpto": "76", "dpto": "VALLE DEL CAUCA", "cod_mpio": "76111", "nom_mpio": "GUADALAJARA DE BUGA",
     "latitud": "3,901000", "longitud": "-76,297000"},
    {"cod_dpto": "20", "dpto": "CESAR", "cod_mpio": "20045", "nom_mpio": "BECERRIL",
     "latitud": "9,704000", "longitud": "-73,279000"},
    {"cod_dpto": "44", "dpto": "LA GUAJIRA", "cod_mpio": "44378", "nom_mpio": "HATONUEVO",
     "latitud": "11,069000", "longitud": "-72,766000"},
    {"cod_dpto": "11", "dpto": "BOGOTÁ, D.C.", "cod_mpio": "11001", "nom_mpio": "BOGOTÁ, D.C.",
     "latitud": "4,649251", "longitud": "-74,106992"},
    {"cod_dpto": "27", "dpto": "CHOCÓ", "cod_mpio": "27660", "nom_mpio": "SAN JOSÉ DEL PALMAR",
     "latitud": "4,896954", "longitud": "-76,234227"},
    {"cod_dpto": "27", "dpto": "CHOCÓ", "cod_mpio": "27372", "nom_mpio": "JURADÓ",
     "latitud": "7,103619", "longitud": "-77,762751"},
]


@pytest.fixture(scope="session")
def resolvedor() -> ResolvedorMunicipios:
    return ResolvedorMunicipios(DIVIPOLA_PRUEBA)


@pytest.fixture(scope="session")
def reglas():
    return cargar_reglas()
