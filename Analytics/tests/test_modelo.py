import numpy as np
import pandas as pd
import pytest

from sismocol.modelo import BASELINE, CLASES, DatosInsuficientes, entrenar_y_evaluar


def datos_sinteticos(n: int = 600, semilla: int = 4) -> pd.DataFrame:
    """El impacto crece con la magnitud y baja con la profundidad, con ruido."""
    rng = np.random.default_rng(semilla)
    magnitud = rng.uniform(3, 7.5, n)
    profundidad = rng.uniform(0, 200, n)
    intensidad = magnitud - 1.2 * np.log10(1 + profundidad / 10) + rng.normal(0, 0.35, n)
    nivel = np.select([intensidad < 3.6, intensidad < 4.6, intensidad < 5.4], CLASES[:3], CLASES[3])
    return pd.DataFrame({"magnitud": magnitud, "profundidad_km": profundidad,
                         "latitud": rng.uniform(0, 10, n), "longitud": rng.uniform(-78, -70, n), "nivel": nivel})


def test_entrenamiento_supera_al_baseline_y_reporta_todo():
    r = entrenar_y_evaluar(datos_sinteticos())
    comparacion = {c["algoritmo"]: c["f1Macro"] for c in r.reporte["comparacion"]}
    assert set(comparacion) == {"Árbol de decisión", "Random Forest", "Regresión logística multinomial", BASELINE}
    assert r.algoritmo != BASELINE
    assert r.f1_macro > comparacion[BASELINE] + 0.3
    assert np.array(r.reporte["matrizConfusion"]).shape == (4, 4)
    assert set(r.reporte["porClase"]) == set(CLASES)
    proba = r.modelo.predict_proba(np.array([[7.2, 10, 5, -74]]))[0]
    assert dict(zip(r.modelo.classes_, proba))["ALTO"] > 0.5


def test_pocos_datos_se_rechazan():
    with pytest.raises(DatosInsuficientes):
        entrenar_y_evaluar(datos_sinteticos(n=20))
