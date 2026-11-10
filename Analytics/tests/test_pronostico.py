import numpy as np
import pandas as pd

from sismocol.pronostico import HORIZONTE_MESES, backtesting, metricas, pronosticar_serie, serie_completa


def test_serie_descarta_meses_incompletos():
    fechas = pd.Series(pd.to_datetime(["2022-11-15 12:00", "2022-12-05 12:00", "2023-01-20 12:00", "2023-02-10 12:00"]))
    s = serie_completa(fechas, inicio=pd.Timestamp("2022-11-10 12:00"), corte=pd.Timestamp("2023-02-10 12:00"))
    assert [str(m) for m in s.index] == ["2022-12", "2023-01"]
    assert s.tolist() == [1.0, 1.0]


def test_metricas_mape_ignora_ceros():
    m = metricas([(1, 10.0, 8.0), (1, 0.0, 2.0), (2, 20.0, 25.0)])
    assert np.isclose(m["mae"], 3.0)
    assert np.isclose(m["mape"], (0.2 + 0.25) / 2 * 100)
    assert m["nMape"] == 2
    assert m["errores1"] == [2.0, -2.0]


def test_backtesting_cuenta_origenes_y_pasos():
    y = np.arange(30, dtype=float)
    r = backtesting(y, (1, 0, 0), (0, 0, 0, 0), h=3, min_entrenamiento=24)
    # Orígenes 24..29: 3+3+3+3+2+1 pronósticos por modelo.
    assert r["INGENUO"]["n"] == 15
    # En una recta creciente el ingenuo a un paso siempre se queda 1 por debajo.
    assert np.isclose(r["INGENUO"]["porHorizonte"]["1"], 1.0)


def test_pronostico_con_estacionalidad_y_bandas_ordenadas():
    rng = np.random.default_rng(0)
    meses = pd.period_range("2022-12", periods=44, freq="M")
    nivel = 40 + 15 * np.sin(2 * np.pi * np.arange(44) / 12)
    serie = pd.Series(rng.poisson(nivel).astype(float), index=meses)
    r = pronosticar_serie("Prueba", 2.0, serie)
    assert r.ganador in {"SARIMA", "INGENUO", "MEDIA_MOVIL_12"}
    assert r.evaluacion[r.ganador]["mae"] == min(e["mae"] for e in r.evaluacion.values() if e["mae"] is not None)
    for p in r.pronosticos.values():
        assert p.media.size == HORIZONTE_MESES
        i95, s95 = p.bandas[0.95]
        i80, s80 = p.bandas[0.80]
        assert np.all(i95 <= i80 + 1e-9) and np.all(s80 <= s95 + 1e-9)
        assert np.all(i95 >= 0)
