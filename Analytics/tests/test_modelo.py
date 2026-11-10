import numpy as np
import pandas as pd
import pytest
from sklearn.linear_model import LogisticRegression

from sismocol.intensidad import distancia_hipocentral, mmi_allen2012
from sismocol.modelo import (
    BASELINE,
    CLASES,
    ContextoMunicipal,
    DatosInsuficientes,
    OrdinalFrankHall,
    asociar_epicentros,
    brier_multiclase,
    construir_variables,
    controles_mismo_evento,
    entrenar_y_evaluar,
    explicar,
)

MUNICIPIOS = pd.DataFrame({
    "codigo": ["00001", "00002", "00003", "00004"],
    "nombre": ["A", "B", "C", "D"],
    "departamento": ["Chocó"] * 4,
    "latitud": [5.0, 5.3, 6.0, 9.0],
    "longitud": [-76.0, -76.0, -76.0, -76.0],
})


def contexto() -> ContextoMunicipal:
    poblacion = pd.DataFrame({"codigo": ["00001", "00002", "00003"], "poblacion": [10000, 50000, 2000],
                              "pct_urbano": [40.0, 80.0, 10.0]})
    vulnerabilidad = pd.DataFrame({"codigo": ["00001", "00002", "00003", "00004"],
                                   "pct_paredes_inadecuadas": [30.0, 5.0, 60.0, 10.0]})
    return ContextoMunicipal.construir(MUNICIPIOS, poblacion, vulnerabilidad)


def test_mmi_allen_2012_decrece_con_la_distancia_y_crece_con_la_magnitud():
    r = np.array([10.0, 30.0, 60.0, 120.0, 250.0])
    mmi = mmi_allen2012(np.full(5, 6.5), r)
    assert np.all(np.diff(mmi) < 0)
    assert mmi_allen2012(7.0, 50.0) > mmi_allen2012(6.0, 50.0)
    # Valor de referencia con los coeficientes publicados: M 6, R = 20 km.
    rm = -0.209 + 2.042 * np.exp(1.0)
    esperado = 2.085 + 1.428 * 6 - 1.402 * np.log(np.sqrt(20 ** 2 + rm ** 2))
    assert np.isclose(mmi_allen2012(6.0, 20.0), esperado)
    assert np.isclose(distancia_hipocentral(5.0, -76.0, 30.0, 5.0, -76.0), 30.0)


def test_contexto_rellena_faltantes_con_la_mediana_y_avisa():
    ctx = contexto()
    assert ctx.disponibles == ["log_poblacion", "pct_urbano", "pct_paredes_inadecuadas"]
    assert np.isclose(ctx.tabla.loc["00004", "log_poblacion"], np.log10(10000))
    assert any("mediana" in a for a in ctx.avisos)
    assert ctx.variables() == ["distancia_hipocentral_km", "mmi", "log_poblacion", "pct_urbano", "pct_paredes_inadecuadas"]


def test_asociacion_de_epicentro_y_controles_del_mismo_evento():
    ctx = contexto()
    reportes = pd.DataFrame({"fecha_hora": pd.to_datetime(["2026-08-10 05:00", "1950-01-01 05:00"]),
                             "codigo": ["00001", "00002"], "magnitud": [7.3, 6.0], "profundidad_km": [110.0, 20.0],
                             "nivel": ["ALTO", "BAJO"]})
    eventos = pd.DataFrame({"id_sismo": [9, 10], "fecha_hora": pd.to_datetime(["2026-08-10 12:34", "2026-08-10 13:00"]),
                            "latitud": [4.86, 4.9], "longitud": [-76.25, -76.2], "magnitud": [7.4, 5.0],
                            "profundidad_km": [116.0, 90.0]})
    r = asociar_epicentros(reportes, eventos, ctx)
    assert r.epicentro_asociado.tolist() == [True, False]
    assert r.id_evento.iloc[0] == 9  # |ΔM| mínima
    assert (r.epi_lat.iloc[1], r.epi_lon.iloc[1]) == (5.3, -76.0)  # sin pareja: centroide
    c = controles_mismo_evento(r, ctx, cupo=10, rng=np.random.default_rng(0))
    # Municipios a ≤ 150 km del epicentro distintos del que reportó: B y C (D está a ~460 km).
    assert sorted(c.codigo) == ["00002", "00003"]
    assert set(c.nivel) == {"SIN_AFECTACION"}


def datos_sinteticos(n: int = 600, semilla: int = 4) -> pd.DataFrame:
    """El impacto crece con la intensidad (magnitud y distancia) y con la vulnerabilidad."""
    rng = np.random.default_rng(semilla)
    ctx = contexto()
    base = pd.DataFrame({
        "codigo": rng.choice(["00001", "00002", "00003"], n), "magnitud": rng.uniform(4, 7.5, n),
        "profundidad_km": rng.uniform(5, 150, n), "epi_lat": rng.uniform(4.5, 6.5, n), "epi_lon": rng.uniform(-77, -75, n),
    })
    d = construir_variables(base, ctx)
    score = d.mmi + 0.02 * d.pct_paredes_inadecuadas + rng.normal(0, 0.3, n)
    d["nivel"] = np.select([score < 4.2, score < 5.0, score < 5.7], CLASES[:3], CLASES[3])
    d["origen"] = "REPORTE"
    return d


def test_entrenamiento_compara_con_los_mismos_pliegues_calibra_y_explica():
    datos = datos_sinteticos()
    r = entrenar_y_evaluar(datos, contexto().variables())
    nombres = {c["algoritmo"] for c in r.reporte["comparacion"]}
    assert nombres == {"Random Forest (actual, 4 variables)", "Random Forest + variables nuevas",
                       "LightGBM + variables nuevas", "Ordinal Frank-Hall (LightGBM)", BASELINE}
    f1 = {c["algoritmo"]: c["f1Macro"] for c in r.reporte["comparacion"]}
    # Las variables nuevas explican el impacto sintético: deben superar al modelo de 4 variables.
    assert max(f1["Random Forest + variables nuevas"], f1["LightGBM + variables nuevas"]) > f1["Random Forest (actual, 4 variables)"]
    assert f1[r.reporte["elegido"]] == max(v for k, v in f1.items() if k != BASELINE)
    for c in r.reporte["comparacion"]:
        assert 0 <= c["brier"] <= 2 and set(c["porClase"]) == set(CLASES)
    assert r.reporte["calibracion"]["metodo"] in {"isotonic", "sigmoid"}
    assert set(r.reporte["confiabilidad"]["calibrado"]) <= set(CLASES)
    assert r.reporte["shap"]["importancia"][0]["variable"] in r.caracteristicas
    fila = datos[r.caracteristicas].iloc[[0]]
    proba = r.modelo.predict_proba(fila.to_numpy(float))[0]
    assert np.isclose(proba.sum(), 1)
    clase = CLASES[int(r.modelo.classes_[int(np.argmax(proba))])]
    exp = explicar({"explicador": r.explicador, "fondo": datos[r.caracteristicas].iloc[:50]}, fila, clase)
    assert {e["variable"] for e in exp} == set(r.caracteristicas)


def test_ordinal_y_brier():
    x = np.arange(40, dtype=float).reshape(-1, 1)
    codigos = np.repeat(np.arange(4), 10)  # 0 = SIN_AFECTACION … 3 = ALTO
    m = OrdinalFrankHall(LogisticRegression()).fit(x, codigos)
    p = m.predict_proba(x)
    assert np.allclose(p.sum(axis=1), 1) and (p >= 0).all()
    assert list(m.classes_) == [0, 1, 2, 3]
    assert (m.predict(x[:5]) == 0).all() and (m.predict(x[-5:]) == 3).all()
    uno = np.eye(4)[codigos]
    assert brier_multiclase(np.array(CLASES)[codigos], uno, CLASES) == 0


def test_pocos_datos_se_rechazan():
    with pytest.raises(DatosInsuficientes):
        entrenar_y_evaluar(datos_sinteticos(n=20))
