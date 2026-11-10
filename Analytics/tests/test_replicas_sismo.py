"""Pronóstico de réplicas al vuelo para cualquier sismo (GET /replicas/sismo/{id})."""
from datetime import timedelta

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from sismocol import replicas
from tests.test_replicas import secuencia_omori

TOKEN = "t" * 40
INICIO = pd.Timestamp("2026-03-01 08:00")


def catalogo(con_secuencia: bool) -> pd.DataFrame:
    """Un M 4,5 aislado en Cesar y, opcionalmente, un M 6,8 en Chocó con una secuencia Omori de muchas réplicas."""
    filas = [{"id_sismo": 1, "fecha_hora": INICIO, "latitud": 9.7, "longitud": -73.3, "profundidad_km": 10.0,
              "magnitud": 4.5, "fuente": "SGC", "municipio": "Becerril", "departamento": "Cesar", "zona": "Cesar"},
             {"id_sismo": 2, "fecha_hora": INICIO + timedelta(days=60), "latitud": 2.0, "longitud": -70.0,
              "profundidad_km": 10.0, "magnitud": 3.0, "fuente": "SGC", "municipio": None, "departamento": None, "zona": None}]
    if con_secuencia:
        t, m = secuencia_omori(k=150.0, t_fin=40.0, mc=3.0)
        t0 = INICIO + timedelta(days=5)
        filas.append({"id_sismo": 10, "fecha_hora": t0, "latitud": 5.0, "longitud": -76.5, "profundidad_km": 20.0,
                      "magnitud": 6.8, "fuente": "SGC", "municipio": "Jurado", "departamento": "Chocó", "zona": "Chocó"})
        rng = np.random.default_rng(7)
        for i, (dias, mag) in enumerate(zip(t, m)):
            filas.append({"id_sismo": 100 + i, "fecha_hora": t0 + timedelta(days=float(dias)),
                          "latitud": 5.0 + rng.normal(0, 0.05), "longitud": -76.5 + rng.normal(0, 0.05),
                          "profundidad_km": 20.0, "magnitud": float(min(mag, 6.7)), "fuente": "SGC",
                          "municipio": None, "departamento": "Chocó", "zona": "Chocó"})
    return pd.DataFrame(filas).sort_values("fecha_hora").reset_index(drop=True)


@pytest.fixture
def sin_base(monkeypatch):
    """Sustituye el acceso a MySQL por un catálogo en memoria."""
    def usar(cat: pd.DataFrame) -> None:
        monkeypatch.setattr(replicas, "catalogo_instrumental", lambda url: cat)
        monkeypatch.setattr(replicas, "detalle", lambda url, i: (_ for _ in ()).throw(replicas.SinPrincipal("no")))
        monkeypatch.setattr(replicas, "_validaciones", lambda url, i: [])
        monkeypatch.setattr(replicas, "_sismo", lambda url, i: {"idSismo": i})
        replicas._cache.clear()
    return usar


def test_m45_sin_replicas_usa_el_generico_con_advertencia(sin_base):
    sin_base(catalogo(con_secuencia=False))
    r = replicas.pronostico_sismo("mysql", 1, 6.0)
    assert r["metodo"] == "GENERICO"
    assert r["pronostico"]["nReplicas"] == 0
    assert "valores típicos" in r["advertencia"]
    siete = next(h for h in r["pronostico"]["resultados"]["horizontes"] if h["horizonte"] == "7d")
    assert [m["magnitud"] for m in siete["magnitudes"]] == [4, 5, 6]
    assert all(0 <= m["probabilidad"] <= 1 for m in siete["magnitudes"])
    assert r["origen"] == "CALCULADO" and r["validacion"] == []


def test_sismo_con_muchas_replicas_usa_maxima_verosimilitud(sin_base):
    sin_base(catalogo(con_secuencia=True))
    r = replicas.pronostico_sismo("mysql", 10, 6.0)
    assert r["metodo"] == "MAXIMA_VEROSIMILITUD"
    assert r["advertencia"] is None
    assert r["pronostico"]["nReplicas"] >= replicas.MIN_REPLICAS_AJUSTE
    assert 0.8 < r["pronostico"]["p"] < 1.5


def test_sismo_pequeno_tambien_tiene_pronostico_con_aviso(sin_base):
    sin_base(catalogo(con_secuencia=False))
    r = replicas.pronostico_sismo("mysql", 2, 6.0)  # M 3,0
    assert r["metodo"] == "GENERICO"
    assert r["advertencia"].startswith("Este sismo es pequeño")
    siete = next(h for h in r["pronostico"]["resultados"]["horizontes"] if h["horizonte"] == "7d")
    assert siete["magnitudes"][0]["probabilidad"] < 0.05  # M 3: muy improbable una réplica de magnitud 4


def test_minimo_de_consulta_configurable(sin_base):
    sin_base(catalogo(con_secuencia=False))
    with pytest.raises(replicas.MagnitudInsuficiente):
        replicas.pronostico_sismo("mysql", 2, 6.0, magnitud_min_consulta=4.0)


def test_calculos_lentos_quedan_en_cache(sin_base, monkeypatch):
    sin_base(catalogo(con_secuencia=False))
    monkeypatch.setattr(replicas, "SEGUNDOS_PARA_CACHE", -1.0)
    primero = replicas.pronostico_sismo("mysql", 1, 6.0)
    segundo = replicas.pronostico_sismo("mysql", 1, 6.0)
    assert primero["origen"] == "CALCULADO" and segundo["origen"] == "CACHE"
    assert segundo["pronostico"] == primero["pronostico"]


def test_endpoint_http(sin_base, monkeypatch):
    monkeypatch.setenv("ANALYTICS_TOKEN", TOKEN)
    monkeypatch.setenv("DATABASE_URL", "mysql+pymysql://u:p@localhost/x")
    from sismocol.config import ajustes
    ajustes.cache_clear()
    from app.main import app
    sin_base(catalogo(con_secuencia=False))
    cliente = TestClient(app)  # sin "with": no arranca el programador
    ok = cliente.get("/replicas/sismo/1", headers={"X-Token-Interno": TOKEN})
    assert ok.status_code == 200 and ok.json()["metodo"] == "GENERICO"
    assert cliente.get("/replicas/sismo/2", headers={"X-Token-Interno": TOKEN}).json()["metodo"] == "GENERICO"
    monkeypatch.setenv("REPLICAS_MAGNITUD_MIN_CONSULTA", "4")
    ajustes.cache_clear()
    assert cliente.get("/replicas/sismo/2", headers={"X-Token-Interno": TOKEN}).status_code == 422
    assert cliente.get("/replicas/sismo/999", headers={"X-Token-Interno": TOKEN}).status_code == 404
    assert cliente.get("/replicas/sismo/1").status_code == 401
    ajustes.cache_clear()
