import pandas as pd

from sismocol.fuentes import usgs
from sismocol.ingest import normalizar_fuente, procesar
from sismocol.servicio import _crudo_usgs

ENCABEZADO = "time,latitude,longitude,depth,mag,magType,place,id\n"


class RespuestaFalsa:
    def __init__(self, texto: str) -> None:
        self.text = texto
        self.status_code = 200 if texto.strip() else 204

    def raise_for_status(self) -> None:
        pass


class SesionFalsa:
    """Devuelve un evento por año; el de 1975 cae justo en el borde y llega dos veces."""

    def __init__(self) -> None:
        self.consultas: list[dict] = []

    def get(self, url, params, timeout):
        self.consultas.append(params)
        anio = int(params["starttime"][:4])
        filas = [f"{anio}-06-01T10:00:00.000Z,6.8,-73.1,150,4.8,mb,Santander,us{anio}"]
        if anio in (1974, 1975):
            filas.append("1975-01-01T00:00:00.000Z,4.4,-77.0,20,5.1,mww,Ecuador,us1975borde")
        return RespuestaFalsa(ENCABEZADO + "\n".join(filas) + "\n")


def test_descarga_historica_pagina_por_anio_y_quita_repetidos(monkeypatch):
    falsa = SesionFalsa()
    monkeypatch.setattr(usgs, "sesion", lambda: falsa)
    df = usgs.descargar_historico("https://usgs", 1973, 1976, 4.5, 10)
    assert [c["starttime"][:4] for c in falsa.consultas] == ["1973", "1974", "1975", "1976"]
    assert all(c["minmagnitude"] == 4.5 and c["minlatitude"] == -4.5 and c["maxlongitude"] == -66.0
               for c in falsa.consultas)
    assert len(df) == 5  # 4 anuales + el del borde una sola vez
    assert df.id.is_unique


def test_fuente_historica_se_reconoce_aparte():
    assert normalizar_fuente("USGS_HIST") == "USGS_HIST"
    assert normalizar_fuente("usgs hist") == "USGS_HIST"
    assert normalizar_fuente("USGS") == "USGS"


def test_procesar_historico_asigna_zona_y_respeta_su_rectangulo(resolvedor, reglas):
    eventos = pd.DataFrame({
        "id": ["us1", "us2", "us3"],
        "time": pd.to_datetime(["1980-01-01 10:00", "1990-05-05 12:00", "2000-02-02 08:00"]),
        "latitude": [6.80, -4.40, 6.75],
        "longitude": [-73.10, -79.0, -73.10],
        "depth": [150.0, 30.0, 10.0],
        "mag": [5.0, 6.1, 4.7],
        "magType": ["mb", "mww", "mb"],
    })
    r = procesar(_crudo_usgs(eventos), "hist", resolvedor, reglas, fuente_por_defecto="USGS_HIST",
                 zona_horaria="UTC")
    d = r.datos.set_index("id_evento_origen")
    assert set(d.fuente) == {"USGS_HIST"}
    assert d.loc["us1", "zona"] == "Nido de Bucaramanga"
    assert d.loc["us3", "zona"] == "Santander"
    # Lat −4,4 está fuera del bbox general (−4,3) pero dentro del histórico: no es anómalo.
    assert not d.loc["us2", "es_anomalo"]
    assert d.loc["us2", "zona"] is None  # sin municipio a ≤ 60 km
    assert (d.precision_ubicacion == "EPICENTRO").all()
