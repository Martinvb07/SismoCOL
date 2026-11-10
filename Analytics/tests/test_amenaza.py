import numpy as np
import pandas as pd

from sismocol.amenaza import malla, mapa_amenaza, periodo_retorno, probabilidades, suavizar


def test_periodo_retorno_y_rango_por_b():
    # log10 λ = 3 − 1·M: λ(5) = 0,01/año → Tr = 100 años.
    tr = periodo_retorno(a=3.0, b=1.0, error_b=0.1, mc=4.5, magnitud=5.0)
    assert np.isclose(tr["tasa"], 0.01) and np.isclose(tr["tr"], 100)
    assert tr["trMin"] < tr["tr"] < tr["trMax"]


def test_probabilidades_crecen_con_el_horizonte():
    p = probabilidades(0.1)
    assert np.isclose(p["anios10"], 1 - np.exp(-1))
    assert p["dias30"] < p["anios1"] < p["anios5"] < p["anios10"] < p["anios50"] < 1


def test_suavizado_conserva_un_campo_uniforme_y_decae_con_la_distancia():
    lat, lon = malla(paso=0.5)
    uniforme = suavizar(np.full(lat.size, 2.0), lat, lon)
    assert np.allclose(uniforme, 2.0)
    pico = np.zeros(lat.size)
    k = int(np.argmin((lat - 5.25) ** 2 + (lon - -74.25) ** 2))
    pico[k] = 10
    s = suavizar(pico, lat, lon)
    vecino = int(np.argmin((lat - 5.75) ** 2 + (lon - -74.25) ** 2))
    lejano = int(np.argmin((lat - 7.25) ** 2 + (lon - -74.25) ** 2))
    assert s[k] > s[vecino] > s[lejano] >= 0
    assert s[k] < 10


def test_mapa_ubica_los_eventos_en_su_celda():
    cat = pd.DataFrame({"latitud": [4.1, 4.2, 10.0], "longitud": [-75.1, -75.2, -70.0], "magnitud": [5.0, 4.8, 4.2],
                        "fecha_hora": pd.to_datetime(["2000-01-01", "2005-01-01", "2010-01-01"])})
    m = mapa_amenaza(cat, mc=4.7, b=1.0, fin=pd.Timestamp("2010-01-01"))
    assert m.eventos.sum() == 2  # el de M 4,2 queda bajo Mc
    celda = m[(m.latitud == 4.25) & (m.longitud == -75.25)]
    assert int(celda.eventos.iloc[0]) == 2
    assert m.probabilidad_10a.between(0, 1).all()
