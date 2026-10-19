import numpy as np
import pytest
from scipy import stats

from sismocol.sismologia import (
    aki_utsu,
    gardner_knopoff,
    gutenberg_richter,
    magnitud_completitud,
    mann_kendall,
    nivel_advertencia,
    p_valor_conteo,
    probabilidad_ocurrencia,
    ventana_gardner_knopoff,
)


def catalogo_gr(b: float, mc_real: float, n: int, semilla: int = 7) -> np.ndarray:
    """Magnitudes de Gutenberg-Richter puro, completas desde mc_real y redondeadas a 0,1."""
    aleatorio = np.random.default_rng(semilla)
    continuas = (mc_real - 0.05) + aleatorio.exponential(1 / (b * np.log(10)), n)
    return np.round(continuas, 1)


def test_b_recupera_valor_real_en_datos_sinteticos():
    # Criterio de éxito de docs/crisp-dm/01_comprension_negocio.md: b = 1,0 ± 0,05
    mags = catalogo_gr(b=1.0, mc_real=2.0, n=50_000)
    resultado = aki_utsu(mags, mc=2.0)
    assert resultado.b == pytest.approx(1.0, abs=0.05)
    assert 0 < resultado.error_b < 0.02


@pytest.mark.parametrize("b_real", [0.8, 1.2])
def test_b_otros_valores(b_real):
    mags = catalogo_gr(b=b_real, mc_real=1.5, n=40_000, semilla=3)
    assert aki_utsu(mags, mc=1.5).b == pytest.approx(b_real, abs=0.05)


def test_mc_por_maxima_curvatura_con_catalogo_incompleto():
    completos = catalogo_gr(b=1.0, mc_real=2.0, n=20_000)
    # Debajo de 2,0 la red detecta cada vez menos sismos
    incompletos = np.round(np.random.default_rng(1).uniform(1.0, 1.95, 3_000), 1)
    mc = magnitud_completitud(np.concatenate([completos, incompletos]))
    assert mc == pytest.approx(2.2)


def test_gutenberg_richter_anual():
    mags = catalogo_gr(b=1.0, mc_real=2.0, n=10_000)
    gr = gutenberg_richter(mags, anios=4.0)
    assert gr.mc == pytest.approx(2.2)
    assert gr.tasa_anual == pytest.approx(gr.n_eventos / 4.0)
    # La recta pasa por (Mc, log10 tasa anual)
    assert gr.a - gr.b * gr.mc == pytest.approx(np.log10(gr.tasa_anual))
    # Puntos: acumulado decreciente y el primero cuenta todo
    assert gr.puntos[0].acumulado == mags.size
    assert all(p.acumulado >= q.acumulado for p, q in zip(gr.puntos, gr.puntos[1:]))
    assert sum(p.incremental for p in gr.puntos) == mags.size


def test_probabilidad_poisson():
    # a = 4, b = 1: 1 sismo M ≥ 4 por año en promedio
    assert probabilidad_ocurrencia(4, 1, 4, 1) == pytest.approx(1 - np.exp(-1))
    assert probabilidad_ocurrencia(4, 1, 6, 10) == pytest.approx(1 - np.exp(-0.1))


def test_mann_kendall_detecta_tendencia_y_sen():
    serie = 10 + 0.5 * np.arange(40) + np.random.default_rng(2).normal(0, 1, 40)
    mk = mann_kendall(serie)
    assert mk.tendencia == "CRECIENTE"
    assert mk.significativa
    assert mk.pendiente_sen == pytest.approx(0.5, abs=0.1)
    assert mk.intercepto_sen == pytest.approx(10, abs=1)


def test_mann_kendall_tau_coincide_con_scipy_sin_empates():
    serie = np.random.default_rng(5).normal(0, 1, 30)
    mk = mann_kendall(serie)
    tau, p = stats.kendalltau(np.arange(30), serie)
    assert mk.tau == pytest.approx(tau)
    assert mk.p_valor == pytest.approx(p, abs=0.02)


def test_mann_kendall_sin_tendencia_y_con_empates():
    serie = np.array([5, 5, 5, 6, 5, 5, 4, 5, 5, 5, 6, 5, 5, 4, 5] * 3, dtype=float)
    mk = mann_kendall(serie)
    assert mk.tendencia == "SIN_TENDENCIA"
    assert 0 <= mk.p_valor <= 1


def test_conteo_poisson_y_niveles():
    assert p_valor_conteo(0, 3.0) == 1.0
    assert p_valor_conteo(3, 3.0) == pytest.approx(stats.poisson.sf(2, 3.0))
    muy_raro = p_valor_conteo(20, 2.0)
    assert muy_raro < 1e-6
    assert nivel_advertencia(muy_raro, 0.05, 0.001) == "ALTA"
    assert nivel_advertencia(0.01, 0.05, 0.001) == "ELEVADA"
    assert nivel_advertencia(0.4, 0.05, 0.001) == "NORMAL"


def test_ventanas_gardner_knopoff():
    distancia, dias = ventana_gardner_knopoff(np.array([5.0, 7.0]))
    assert distancia[0] == pytest.approx(39.99, abs=0.1)
    assert dias[0] == pytest.approx(143.4, abs=0.5)
    assert dias[1] == pytest.approx(917.3, abs=1)  # M ≥ 6,5 usa la otra recta


def test_gardner_knopoff_marca_solo_replicas():
    tiempos = np.array([10.0, 10.5, 11.0, 12.0, 9.0, 10.2])
    lat = np.array([7.0, 7.01, 7.02, 7.0, 7.0, 9.0])
    lon = np.array([-73.0, -73.01, -73.0, -73.02, -73.0, -75.0])
    mag = np.array([6.0, 3.0, 4.5, 2.5, 3.5, 4.0])
    replica = gardner_knopoff(tiempos, lat, lon, mag)
    # 1, 2 y 3 son posteriores y cercanos al M6; 4 es anterior; 5 está a ~300 km
    assert replica.tolist() == [False, True, True, True, False, False]


def test_gardner_knopoff_sin_coordenadas_no_marca():
    replica = gardner_knopoff(np.array([0.0, 1.0]), np.array([np.nan, 7.0]),
                              np.array([np.nan, -73.0]), np.array([6.0, 3.0]))
    assert not replica.any()
