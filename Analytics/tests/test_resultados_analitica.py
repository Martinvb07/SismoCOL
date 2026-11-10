from eda.resultados_analitica import _dentro_m4, n, pct, tabla


def test_formato_numerico_en_espanol():
    assert n(1234.5, 1) == "1 234,5"
    assert n(None) == "—"
    assert pct(0.1234) == "12,3 %"


def test_tabla_markdown():
    assert tabla(["A", "B"], [["1", "2"]]).splitlines() == ["| A | B |", "|---|---|", "| 1 | 2 |"]


def test_fraccion_dentro_solo_m4():
    horizontes = [{"magnitudes": [{"magnitud": 4, "dentroIc95": True}, {"magnitud": 6, "dentroIc95": True}]},
                  {"magnitudes": [{"magnitud": 4, "dentroIc95": False}]}]
    assert _dentro_m4(horizontes) == 0.5
