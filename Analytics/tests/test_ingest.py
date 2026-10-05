import io

import pandas as pd
import pytest

from sismocol.ingest import (
    ErrorIngesta,
    enriquecer_con_usgs,
    leer_archivo,
    mapear_columnas,
    procesar,
)


def fila(**kw):
    base = {
        "ID_Evento": "SGC1", "Fecha": "2024-03-01 10:00:00", "Departamento": "Santander",
        "Municipio": "Los Santos", "Magnitud": 2.5, "Profundidad_km": 145.0,
        "Fuente_Dataset": "SGC_Catalogo_Sismico",
    }
    base.update(kw)
    return base


def ejecutar(filas, resolvedor, reglas, **kw):
    return procesar(pd.DataFrame(filas), "prueba.xlsx", resolvedor, reglas, **kw)


# ─── Mapeo y lectura ────────────────────────────────────────────────────────

def test_mapeo_tolera_mayusculas_tildes_y_alias():
    mapeo = mapear_columnas(["FECHA", "Latitude", "LON", "Profundidad (km)", "Mag", "Muertos",
                             "Viviendas_Afectadas"])
    assert mapeo["fecha"] == "FECHA"
    assert mapeo["latitud"] == "Latitude"
    assert mapeo["longitud"] == "LON"
    assert mapeo["profundidad_km"] == "Profundidad (km)"
    assert mapeo["magnitud"] == "Mag"
    assert mapeo["fallecidos"] == "Muertos"
    assert mapeo["viviendas_averiadas"] == "Viviendas_Afectadas"


def test_rechaza_columnas_obligatorias_faltantes(resolvedor, reglas):
    with pytest.raises(ErrorIngesta, match="magnitud"):
        ejecutar([{"Fecha": "2024-01-01", "Municipio": "Los Santos", "Profundidad": 10}],
                 resolvedor, reglas, fuente_por_defecto="SGC")


def test_rechaza_sin_ubicacion_ni_fuente(resolvedor, reglas):
    with pytest.raises(ErrorIngesta, match="latitud y longitud"):
        ejecutar([{"Fecha": "2024-01-01", "Magnitud": 3, "Profundidad": 10}],
                 resolvedor, reglas, fuente_por_defecto="SGC")
    with pytest.raises(ErrorIngesta, match="fuente"):
        ejecutar([{"Fecha": "2024-01-01", "Magnitud": 3, "Profundidad": 10, "Municipio": "X"}],
                 resolvedor, reglas)


def test_lee_csv_con_punto_y_coma_y_latin1():
    contenido = "fecha;magnitud;profundidad;latitud;longitud\n2024-01-01;3,2;10;6,7;-73,1\n"
    df = leer_archivo(contenido.encode("latin-1"), "datos.csv")
    assert list(df.columns) == ["fecha", "magnitud", "profundidad", "latitud", "longitud"]


def test_formato_no_soportado():
    with pytest.raises(ErrorIngesta, match="no soportado"):
        leer_archivo(b"x", "datos.pdf")


# ─── Normalización ──────────────────────────────────────────────────────────

def test_fechas_a_utc_segun_fuente(resolvedor, reglas):
    r = ejecutar([
        fila(),
        fila(ID_Evento="1990-0001", Fecha="1990-05-10", Fuente_Dataset="DesInventar", Muertos=0),
    ], resolvedor, reglas)
    df = r.datos.set_index("fuente")
    assert df.loc["SGC", "fecha_hora"] == pd.Timestamp("2024-03-01 10:00:00")  # ya en UTC
    assert df.loc["DESINVENTAR", "fecha_hora"] == pd.Timestamp("1990-05-10 05:00:00")  # 00:00 Bogotá


def test_fecha_y_hora_en_columnas_separadas(resolvedor, reglas):
    r = ejecutar([{"fecha": "2024-03-01", "hora": "07:30:15", "latitud": 6.7, "longitud": -73.1,
                   "magnitud": 3.0, "profundidad": 10}], resolvedor, reglas,
                 fuente_por_defecto="SGC")
    assert r.datos.fecha_hora.iloc[0] == pd.Timestamp("2024-03-01 07:30:15")


def test_fecha_colombiana_dia_primero(resolvedor, reglas):
    r = ejecutar([fila(Fecha="05/03/2024 08:00:00")], resolvedor, reglas)
    assert r.datos.fecha_hora.iloc[0] == pd.Timestamp("2024-03-05 08:00:00")


def test_conteo_con_separador_de_miles(resolvedor, reglas):
    r = ejecutar([fila(Fuente_Dataset="UNGRD", Fecha="2020-04-15", Afectados=1.197, Muertos=0)],
                 resolvedor, reglas)
    assert r.datos.personas_afectadas.iloc[0] == 1197


def test_coordenadas_centroide_y_zona(resolvedor, reglas):
    r = ejecutar([fila(), fila(ID_Evento="SGC2", Profundidad_km=20.0)], resolvedor, reglas)
    df = r.datos
    assert (df.precision_ubicacion == "CENTROIDE_MUNICIPIO").all()
    assert df.latitud.iloc[0] == pytest.approx(6.755203)
    assert list(df.zona) == ["Nido de Bucaramanga", "Santander"]


def test_coordenadas_del_archivo_y_municipio_mas_cercano(resolvedor, reglas):
    r = ejecutar([{"fecha": "2026-08-10 12:34:28", "latitud": 4.8836, "longitud": -76.2182,
                   "magnitud": 7.4, "profundidad": 108}], resolvedor, reglas,
                 fuente_por_defecto="USGS")
    df = r.datos.iloc[0]
    assert df.precision_ubicacion == "EPICENTRO"
    assert df.municipio == "San José del Palmar" and df.departamento == "Chocó"
    assert df.zona == "Chocó"


# ─── Anomalías ──────────────────────────────────────────────────────────────

def test_anomalias_se_marcan_sin_borrar(resolvedor, reglas):
    r = ejecutar([
        fila(ID_Evento="A", Profundidad_km=-2.0),
        fila(ID_Evento="B", Magnitud=None),
        fila(ID_Evento="C", Departamento="Carchi, Ecuador", Municipio="Tufiño"),
        fila(ID_Evento="D", Municipio="Inexistente"),
        fila(ID_Evento="E", Fecha="2024-03-02 10:00:00"),
    ], resolvedor, reglas)
    df = r.datos.set_index("id_evento_origen")
    assert len(df) == 5
    assert df.loc["A", "motivo_anomalia"] == "profundidad negativa"
    assert df.loc["B", "motivo_anomalia"] == "magnitud nula"
    assert df.loc["C", "motivo_anomalia"] == "fuera de Colombia"
    assert df.loc["D", "motivo_anomalia"] == "sin ubicación"
    assert not df.loc["E", "es_anomalo"]
    assert r.validos == 1
    assert r.por_fuente[0].por_motivo == {
        "profundidad negativa": 1, "magnitud nula": 1, "fuera de Colombia": 1, "sin ubicación": 1}


def test_coordenadas_fuera_del_bbox(resolvedor, reglas):
    r = ejecutar([{"fecha": "2024-01-01", "latitud": 20.0, "longitud": -60.0, "magnitud": 4,
                   "profundidad": 10}], resolvedor, reglas, fuente_por_defecto="USGS")
    assert r.datos.motivo_anomalia.iloc[0] == "fuera de Colombia"


def test_filas_sin_fecha_se_rechazan(resolvedor, reglas):
    r = ejecutar([fila(), fila(ID_Evento="X", Fecha="no es fecha")], resolvedor, reglas)
    assert r.leidos == 2 and r.rechazados_sin_fecha == 1 and len(r.datos) == 1


# ─── Duplicados ─────────────────────────────────────────────────────────────

def test_duplicado_por_tiempo_distancia_y_magnitud(resolvedor, reglas):
    r = ejecutar([
        fila(ID_Evento="A", Fecha="2024-03-01 10:00:00", Magnitud=2.5),
        fila(ID_Evento="B", Fecha="2024-03-01 10:00:04", Magnitud=2.6),  # duplicado de A
        fila(ID_Evento="C", Fecha="2024-03-01 10:00:20", Magnitud=2.5),  # > 5 s
        fila(ID_Evento="D", Fecha="2024-03-01 10:00:21", Magnitud=3.0),  # ΔM > 0,1 respecto a C
        fila(ID_Evento="E", Fecha="2024-03-01 10:00:22", Municipio="El Carmen", Magnitud=3.0),  # > 5 km
    ], resolvedor, reglas)
    duplicados = set(r.datos[r.datos.motivo_anomalia == "duplicado"].id_evento_origen)
    assert duplicados == {"B"}


def test_reportes_de_dano_en_municipios_distintos_no_son_duplicados(resolvedor, reglas):
    base = dict(Fecha="1979-11-23", Fuente_Dataset="DesInventar", Magnitud=6.5, Muertos=0)
    r = ejecutar([
        fila(ID_Evento="1979-1", **base),
        fila(ID_Evento="1979-2", Departamento="Valle del Cauca", Municipio="Buga", **base),
    ], resolvedor, reglas)
    assert not r.datos.motivo_anomalia.fillna("").str.contains("duplicado").any()


def test_repetidos_exactos_y_id_ungrd(resolvedor, reglas):
    ungrd = fila(ID_Evento="27,372", Fecha="2019-05-24", Departamento="CHOCO", Municipio="JURADO",
                 Fuente_Dataset="UNGRD_datos.gov.co", Muertos=0, Magnitud=5.0, Profundidad_km=25)
    r = ejecutar([ungrd, ungrd], resolvedor, reglas)
    df = r.datos
    assert list(df.id_evento_origen) == ["20190524-27372", "20190524-27372"]
    assert df.motivo_anomalia.iloc[1].startswith("duplicado")
    assert "repetido en el archivo" in df.motivo_anomalia.iloc[1]
    assert df.clave_origen.iloc[0] == df.clave_origen.iloc[1]


def test_copias_identicas_marcan_solo_la_posterior(resolvedor, reglas):
    """Con muchas filas en el mismo instante, el original nunca debe quedar marcado."""
    base = dict(Fecha="2025-06-08", Fuente_Dataset="UNGRD", Magnitud=6.4, Profundidad_km=15,
                Muertos=0)
    municipios = [("Santander", "Los Santos", "68418"), ("Cesar", "Becerril", "20045"),
                  ("Chocó", "Juradó", "27372"), ("La Guajira", "Hatonuevo", "44378")]
    filas = [fila(ID_Evento=f"20250608-{c}", Departamento=d, Municipio=m, **base)
             for d, m, c in municipios]
    r = ejecutar(filas + filas, resolvedor, reglas)
    motivos = r.datos.motivo_anomalia.fillna("").tolist()
    assert motivos[:4] == ["", "", "", ""]
    assert all("repetido en el archivo" in m for m in motivos[4:])


def test_clave_origen_estable(resolvedor, reglas):
    a = ejecutar([fila()], resolvedor, reglas).datos.clave_origen.iloc[0]
    b = ejecutar([fila()], resolvedor, reglas).datos.clave_origen.iloc[0]
    assert a == b and len(a) == 64


# ─── Impacto y USGS ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("afectacion, nivel", [
    ({"Muertos": 1}, "ALTO"),
    ({"Muertos": 0, "Viviendas_Destruidas": 50}, "ALTO"),
    ({"Heridos": 2}, "MODERADO"),
    ({"Viviendas_Destruidas": 1}, "MODERADO"),
    ({"Afectados": 10}, "BAJO"),
    ({"Viviendas_Afectadas": 1}, "BAJO"),
    ({"Muertos": 0, "Heridos": 0}, "SIN_AFECTACION"),
])
def test_nivel_impacto(resolvedor, reglas, afectacion, nivel):
    r = ejecutar([fila(Fuente_Dataset="DesInventar", Fecha="2000-01-01", **afectacion)],
                 resolvedor, reglas)
    assert r.datos.nivel_impacto.iloc[0] == nivel


def test_sin_datos_de_afectacion_no_hay_nivel(resolvedor, reglas):
    assert ejecutar([fila()], resolvedor, reglas).datos.nivel_impacto.iloc[0] is None


def test_enriquecer_con_usgs(resolvedor, reglas):
    r = ejecutar([fila(ID_Evento="A", Fecha="2026-08-10 12:34:30", Departamento="Chocó",
                       Municipio="San José del Palmar", Magnitud=7.2, Profundidad_km=110),
                  fila(ID_Evento="B", Fecha="2026-08-10 13:00:00", Magnitud=2.5)],
                 resolvedor, reglas)
    usgs = pd.DataFrame([{"id": "us6000tjl2", "time": pd.Timestamp("2026-08-10 12:34:28"),
                          "latitude": 4.8836, "longitude": -76.2182, "mag": 7.4}])
    df = enriquecer_con_usgs(r.datos, usgs).set_index("id_evento_origen")
    assert df.loc["A", "precision_ubicacion"] == "EPICENTRO"
    assert df.loc["A", "latitud"] == pytest.approx(4.8836)
    assert df.loc["A", "magnitud"] == 7.2  # se conserva la magnitud de la fuente
    assert df.loc["B", "precision_ubicacion"] == "CENTROIDE_MUNICIPIO"
