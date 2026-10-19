import pandas as pd

from sismocol.analisis import region_zona, serie_mensual


def test_serie_mensual_en_hora_colombia_y_sin_huecos():
    fechas = pd.Series(pd.to_datetime([
        "2026-01-01 03:00",  # 31-dic-2025 22:00 en Bogotá
        "2026-01-15 12:00",
        "2026-03-02 12:00",
    ]))
    serie = serie_mensual(fechas, corte=pd.Timestamp("2026-03-31 12:00"), inicio=pd.Timestamp("2025-12-01 12:00"))
    assert serie.mes.tolist() == ["2025-12", "2026-01", "2026-02", "2026-03"]
    assert serie.eventos.tolist() == [1, 1, 0, 1]
    assert serie.media.isna().all()  # menos de 12 meses: sin media móvil


def test_region_de_zonas():
    assert region_zona("Nido de Bucaramanga") == "Región Andina"
    assert region_zona("Guaviare") == "Región Amazonía"
    assert region_zona("Atlántida") == "Sin región"
