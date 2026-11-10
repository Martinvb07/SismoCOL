import numpy as np
import pandas as pd

from sismocol.replicas import (
    GENERICO,
    ajustar_reasenberg_jones,
    integral_omori,
    principales,
    pronosticar,
    resumen_validacion,
    secuencia,
    validar,
)


def secuencia_omori(k=200.0, c=0.05, p=1.1, t_fin=60.0, b=1.0, mc=3.0, semilla=1):
    """Tiempos de un proceso de Poisson con tasa K (t + c)^(−p) (inversión de la integral) y magnitudes GR."""
    rng = np.random.default_rng(semilla)
    total = k * float(integral_omori(c, p, 0, t_fin))
    n = rng.poisson(total)
    u = rng.uniform(0, 1, n) * float(integral_omori(c, p, 0, t_fin))
    tiempos = ((1 - p) * u + c ** (1 - p)) ** (1 / (1 - p)) - c
    magnitudes = np.round(mc + rng.exponential(1 / (b * np.log(10)), n), 1)
    return np.sort(tiempos), magnitudes


def test_integral_omori_con_p_igual_a_uno():
    assert np.isclose(float(integral_omori(0.1, 1.0, 0, 9.9)), np.log(100))
    assert np.isclose(float(integral_omori(0.1, 1.0 + 1e-9, 0, 9.9)), np.log(100), rtol=1e-6)


def test_recupera_p_c_y_b_de_una_secuencia_sintetica():
    t, m = secuencia_omori()
    par = ajustar_reasenberg_jones(t, m, mm=7.0, t_fin=60.0, mc=3.0)
    assert par.metodo == "MAXIMA_VEROSIMILITUD"
    assert abs(par.p - 1.1) < 0.12
    assert 0.01 < par.c < 0.2
    assert abs(par.b - 1.0) < 0.15
    assert par.covarianza is not None
    # El número esperado en todo el periodo reproduce el observado.
    assert abs(par.tasa_integrada(3.0, 0, 60) - (m >= 3.0).sum()) / (m >= 3.0).sum() < 0.05


def test_pocas_replicas_usan_parametros_genericos():
    par = ajustar_reasenberg_jones(np.array([0.1, 2.0]), np.array([4.1, 4.3]), mm=6.2, t_fin=3.0)
    assert par.metodo == "GENERICO"
    assert (par.a, par.b, par.p, par.c) == (GENERICO["a"], GENERICO["b"], GENERICO["p"], GENERICO["c"])
    assert par.avisos


def test_con_algunas_replicas_solo_a_sale_de_la_secuencia():
    t = np.array([0.05, 0.2, 0.5, 1.0, 2.5])
    par = ajustar_reasenberg_jones(t, np.full(5, 4.2), mm=6.5, t_fin=3.0, mc=4.0)
    assert par.metodo == "GENERICO_A_SECUENCIA"
    assert (par.b, par.p, par.c) == (GENERICO["b"], GENERICO["p"], GENERICO["c"])
    assert np.isclose(par.tasa_integrada(4.0, 0, 3.0), 5.0)


def test_probabilidades_crecen_con_el_horizonte_y_bajan_con_la_magnitud():
    t, m = secuencia_omori()
    par = ajustar_reasenberg_jones(t, m, mm=7.0, t_fin=5.0, mc=3.0)
    horizontes = pronosticar(par, 5.0, np.random.default_rng(0))
    p_m4 = [h["magnitudes"][0]["probabilidad"] for h in horizontes]
    assert p_m4 == sorted(p_m4)
    for h in horizontes:
        probs = [x["probabilidad"] for x in h["magnitudes"]]
        assert probs == sorted(probs, reverse=True)
        for x in h["magnitudes"]:
            assert x["ic95"][0] <= x["esperado"] <= x["ic95"][1] + 1


def test_validacion_cubre_lo_observado_en_una_secuencia_que_sigue_el_modelo():
    t, m = secuencia_omori(t_fin=40.0, semilla=3)
    resultados = validar(t, m, mm=7.0, t_datos=40.0, rng=np.random.default_rng(0))
    assert [r["horasAjuste"] for r in resultados] == [24, 72, 168]
    resumen = resumen_validacion(resultados)
    assert resumen["casos"] == 3 * 3 * 4  # Mc = 3 más M 4, 5 y 6
    assert "horizontesGenerico" in resultados[0]
    assert resumen["fraccionDentroIc95"] >= 0.8
    # Horizonte de 30 días desde el día 7: los datos llegan al 40, cobertura completa.
    assert resultados[2]["horizontes"][2]["cobertura"] == 1.0


def test_principales_y_secuencia_con_ventanas_de_gardner_knopoff():
    cat = pd.DataFrame({
        "id_sismo": [1, 2, 3, 4, 5, 6],
        "fecha_hora": pd.to_datetime(["2026-08-10 12:00", "2026-08-10 14:00", "2026-08-13 12:00",
                                      "2026-08-15 12:00", "2026-08-11 12:00", "2026-08-10 11:59"]),
        "latitud": [4.86, 4.90, 4.80, 8.0, 4.88, 4.85],
        "longitud": [-76.25, -76.20, -76.30, -73.0, -76.26, -76.25],
        "magnitud": [7.4, 6.1, 4.5, 6.3, 5.0, 6.8],
        "fuente": ["SGC"] * 6,
    })
    p = principales(cat, 6.0)
    # El 6,1 es réplica del 7,4, el 6,8 su precursor (1 min antes) y el 6,3 está lejos.
    assert p.id_sismo.tolist() == [4, 1]
    seq = secuencia(cat, cat.iloc[0])
    assert sorted(seq.id_sismo.tolist()) == [2, 3, 5]
    assert np.isclose(seq.set_index("id_sismo").loc[3, "dias"], 3.0)
