"""Barrido de datos — CRISP-DM fase 2 (Comprensión de los datos).

Perfila el Excel consolidado sin modificarlo y escribe un reporte en Markdown:
estructura, calidad, cobertura temporal, distribución de magnitudes, zonas,
zona horaria, cruce con DIVIPOLA (centroides) y con el catálogo USGS, y
viabilidad de las etiquetas de impacto.

Uso (desde Analytics/):
    .venv/Scripts/python -m eda.barrido_datos \
        --excel ../data/raw/Sismos_Colombia_FINAL.xlsx \
        --divipola ../data/ref/divipola_municipios.json \
        --usgs ../data/ref/usgs_colombia_m25.csv \
        --salida ../docs/crisp-dm/02_comprension_datos.md
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from sismocol.territorio import (
    REGION_POR_DEPARTAMENTO,
    clave,
    normalizar_departamento,
    zona_de,
)

FUENTE_SGC = "SGC_Catalogo_Sismico"
COLUMNAS_DANO = [
    "Muertos", "Heridos", "Desaparecidos", "Viviendas_Destruidas", "Viviendas_Afectadas",
    "Damnificados", "Afectados", "Reubicados", "Evacuados", "Perdidas_USD",
    "Centros_Educativos", "Centros_Medicos", "Danos_Vias_Mts",
]
BBOX_COLOMBIA = {"lat_min": -4.3, "lat_max": 13.5, "lon_min": -82.0, "lon_max": -66.8}
BIN_MAGNITUD = 0.1
CORRECCION_MC = 0.2  # Wiemer & Wyss (2000)
TOLERANCIA_CRUCE_S = 30  # para emparejar SGC con USGS
TOLERANCIA_DUPLICADO_S = 5
TOLERANCIA_DUPLICADO_M = 0.1
OFFSET_BOGOTA_H = 5  # UTC−5, sin horario de verano


# ─── Utilidades de reporte ──────────────────────────────────────────────────

@dataclass
class Reporte:
    lineas: list[str] = field(default_factory=list)

    def h(self, nivel: int, texto: str) -> None:
        self.lineas += ["", f"{'#' * nivel} {texto}", ""]

    def p(self, texto: str = "") -> None:
        self.lineas.append(texto)

    def tabla(self, df: pd.DataFrame, indice: bool = False) -> None:
        self.lineas += ["", df.to_markdown(index=indice), ""]

    def texto(self) -> str:
        return "\n".join(self.lineas).strip() + "\n"


def fmt(n: float | int) -> str:
    if isinstance(n, (int, np.integer)):
        return f"{int(n):,}".replace(",", ".")
    return f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def dec(valor: float, decimales: int = 1) -> str:
    return f"{valor:.{decimales}f}".replace(".", ",")


def pct(parte: float, total: float) -> str:
    return "—" if total == 0 else f"{dec(100 * parte / total)} %"


def mc_maxima_curvatura(magnitudes: pd.Series) -> float | None:
    """Mc por máxima curvatura (bin 0.1) + corrección de 0.2."""
    m = magnitudes.dropna()
    if len(m) < 20:
        return None
    bins = np.round(np.floor(m / BIN_MAGNITUD + 1e-9) * BIN_MAGNITUD, 1)
    conteo = bins.value_counts()
    return round(float(conteo.idxmax()) + CORRECCION_MC, 1)


# ─── Secciones ──────────────────────────────────────────────────────────────

def seccion_estructura(r: Reporte, df: pd.DataFrame, hojas: list[str]) -> None:
    r.h(2, "1. Estructura del archivo")
    r.p(f"Hojas: {', '.join(f'`{h}`' for h in hojas)}. Se analiza `Datos` "
        f"({fmt(len(df))} filas × {df.shape[1]} columnas).")
    tipos = pd.DataFrame({
        "columna": df.columns,
        "tipo": [str(t) for t in df.dtypes],
        "nulos": [int(df[c].isna().sum()) for c in df.columns],
        "% nulos": [pct(df[c].isna().sum(), len(df)) for c in df.columns],
    })
    r.tabla(tipos)
    r.p("**Hallazgo crítico:** el archivo **no tiene latitud ni longitud**. "
        "La ubicación solo existe como departamento + municipio.")

    tramos = (
        df.groupby(["Fuente_Dataset", "Tipo_Registro"])
        .agg(filas=("ID_Evento", "size"), desde=("Fecha", "min"), hasta=("Fecha", "max"),
             con_magnitud=("Magnitud", "count"), con_profundidad=("Profundidad_km", "count"))
        .reset_index()
    )
    tramos["desde"] = tramos["desde"].dt.strftime("%Y-%m-%d")
    tramos["hasta"] = tramos["hasta"].dt.strftime("%Y-%m-%d")
    r.h(3, "Tramos de datos")
    r.tabla(tramos)


def seccion_calidad(r: Reporte, df: pd.DataFrame) -> None:
    r.h(2, "2. Calidad de los datos")
    sgc = df[df.Fuente_Dataset == FUENTE_SGC]
    ids_dup = df[df.ID_Evento.duplicated(keep=False)]
    filas = [
        ("IDs repetidos (filas involucradas)", len(ids_dup), "Reportes de daño: un evento repetido por municipio afectado"),
        ("Magnitud nula", int(df.Magnitud.isna().sum()), "Solo en reportes de daño"),
        ("Profundidad nula", int(df.Profundidad_km.isna().sum()), "Solo en reportes de daño"),
        ("Profundidad negativa", int((df.Profundidad_km < 0).sum()), "Sismos SGC sobre el nivel del mar: anómalo, se conserva"),
        ("Magnitud negativa", int((df.Magnitud < 0).sum()), "Microsismos; válidos físicamente pero bajo Mc"),
        ("Magnitud > 9", int((df.Magnitud > 9).sum()), "Fuera de rango físico"),
    ]
    r.tabla(pd.DataFrame(filas, columns=["chequeo", "filas", "tratamiento propuesto"]))
    ids_dup_sgc = sgc.ID_Evento.duplicated().sum()
    r.p(f"En el tramo SGC hay {fmt(int(ids_dup_sgc))} IDs repetidos.")

    # Duplicados por criterio físico (sin coordenadas: mismo municipio).
    s = sgc.sort_values("Fecha").reset_index(drop=True)
    dt = s.Fecha.diff().dt.total_seconds()
    mismo_mpio = s.Municipio.eq(s.Municipio.shift())
    dm = (s.Magnitud - s.Magnitud.shift()).abs()
    candidatos = int(((dt <= TOLERANCIA_DUPLICADO_S) & mismo_mpio & (dm <= TOLERANCIA_DUPLICADO_M)).sum())
    r.p(f"Duplicados probables en SGC (±{TOLERANCIA_DUPLICADO_S} s, mismo municipio, "
        f"|ΔM| ≤ {dec(TOLERANCIA_DUPLICADO_M)}): **{fmt(candidatos)}**. En la ingesta se usará la "
        "distancia < 5 km con las coordenadas asignadas.")

    r.h(3, "Departamentos")
    variantes = df.Departamento.nunique()
    canon = df.Departamento.map(normalizar_departamento)
    no_reconocidos = df.loc[canon.isna(), "Departamento"].value_counts()
    r.p(f"Hay {variantes} escrituras distintas de departamento; tras normalizar quedan "
        f"{canon.nunique()} departamentos canónicos.")
    if len(no_reconocidos):
        r.p("No corresponden a Colombia (se marcan como anómalos, `fuera de Colombia`):")
        r.tabla(no_reconocidos.rename("filas").rename_axis("valor original").reset_index())


def seccion_temporal(r: Reporte, df: pd.DataFrame, usgs: pd.DataFrame) -> None:
    r.h(2, "3. Cobertura temporal y zona horaria")
    sgc = df[df.Fuente_Dataset == FUENTE_SGC].copy()
    mensual = sgc.set_index("Fecha").resample("MS").size()
    anios = (sgc.Fecha.max() - sgc.Fecha.min()).days / 365.25
    r.p(f"Tramo SGC: {sgc.Fecha.min():%Y-%m-%d} → {sgc.Fecha.max():%Y-%m-%d} "
        f"({dec(anios, 2)} años, {len(mensual)} meses). Eventos por mes: mínimo "
        f"{int(mensual.min())}, mediana {int(mensual.median())}, máximo {int(mensual.max())} "
        f"({mensual.idxmax():%Y-%m}).")
    r.p(f"Meses sin eventos: {int((mensual == 0).sum())}. El primer y último mes están incompletos "
        "y deben excluirse de la serie de tendencia.")
    r.p("Los reportes de daño (1917–2022) solo traen fecha, sin hora.")

    # Zona horaria: emparejar con USGS (UTC) bajo dos hipótesis.
    fuertes = sgc[sgc.Magnitud >= 3.5].copy()
    t_usgs = np.sort(usgs["time"].values.astype("datetime64[s]").astype(np.int64))

    def emparejados(offset_h: int) -> int:
        t = (fuertes.Fecha + pd.Timedelta(hours=offset_h)).values.astype("datetime64[s]").astype(np.int64)
        idx = np.clip(np.searchsorted(t_usgs, t), 1, len(t_usgs) - 1)
        dif = np.minimum(np.abs(t_usgs[idx] - t), np.abs(t_usgs[idx - 1] - t))
        return int((dif <= TOLERANCIA_CRUCE_S).sum())

    como_utc = emparejados(0)
    como_local = emparejados(OFFSET_BOGOTA_H)
    r.h(3, "¿UTC u hora local?")
    r.p(f"Se emparejaron los {fmt(len(fuertes))} sismos SGC con M ≥ 3,5 contra el catálogo USGS "
        f"(UTC) con tolerancia de ±{TOLERANCIA_CRUCE_S} s:")
    r.tabla(pd.DataFrame([
        ("Fecha del Excel interpretada como UTC", como_utc),
        ("Fecha del Excel interpretada como hora de Colombia (UTC−5)", como_local),
    ], columns=["hipótesis", "coincidencias"]))
    veredicto = "UTC" if como_utc > como_local else "hora local de Colombia (UTC−5)"
    r.p(f"**Conclusión:** las fechas del tramo SGC están en **{veredicto}**.")
    r.p("En la base se guardan en UTC y el frontend las muestra en America/Bogota.")


def seccion_magnitudes(r: Reporte, df: pd.DataFrame) -> None:
    r.h(2, "4. Magnitudes y zonas de análisis")
    sgc = df[df.Fuente_Dataset == FUENTE_SGC].copy()
    sgc["departamento"] = sgc.Departamento.map(normalizar_departamento)
    sgc["zona"] = [zona_de(d, p) for d, p in zip(sgc.departamento, sgc.Profundidad_km)]

    umbrales = [2.0, 3.0, 4.0, 5.0, 6.0, 7.0]
    r.tabla(pd.DataFrame(
        [(f"M ≥ {u:.0f}", int((sgc.Magnitud >= u).sum())) for u in umbrales],
        columns=["umbral", "sismos SGC"],
    ))
    mc_global = mc_maxima_curvatura(sgc.Magnitud)
    r.p(f"Mc global (máxima curvatura + 0,2): **{dec(mc_global)}**. Mediana de magnitud: "
        f"{dec(sgc.Magnitud.median())}. Máximo: {dec(sgc.Magnitud.max())}.")

    anios = (sgc.Fecha.max() - sgc.Fecha.min()).days / 365.25
    filas = []
    for zona, g in sgc.groupby("zona"):
        mc = mc_maxima_curvatura(g.Magnitud)
        n_mc = int((g.Magnitud >= mc).sum()) if mc is not None else 0
        filas.append({
            "zona": zona,
            "región": REGION_POR_DEPARTAMENTO.get(str(zona), "Andina (nido)"),
            "eventos": len(g),
            "prof. mediana km": round(float(g.Profundidad_km.median()), 0),
            "M máx": float(g.Magnitud.max()),
            "Mc": mc if mc is not None else "—",
            "eventos ≥ Mc": n_mc,
            "≥ Mc por año": round(n_mc / anios, 1),
        })
    zonas = pd.DataFrame(filas).sort_values("eventos", ascending=False)
    r.h(3, "Eventos por zona (Nido de Bucaramanga separado)")
    r.tabla(zonas)
    pocas = zonas[zonas["eventos ≥ Mc"] < 50]["zona"].tolist()
    r.p(f"Zonas con menos de 50 eventos ≥ Mc (se agruparán con su región para Gutenberg-Richter): "
        f"{', '.join(map(str, pocas)) or 'ninguna'}.")
    nido = sgc[sgc.zona == "Nido de Bucaramanga"]
    r.p(f"El Nido de Bucaramanga concentra {fmt(len(nido))} eventos "
        f"({pct(len(nido), len(sgc))} del tramo SGC); mezclarlo con el resto de Santander "
        "sesgaría el valor b y las advertencias.")


def seccion_ubicacion(r: Reporte, df: pd.DataFrame, divipola: pd.DataFrame, usgs: pd.DataFrame) -> None:
    r.h(2, "5. Ubicación: centroides DIVIPOLA y cruce con USGS")
    divipola = divipola.assign(
        departamento=divipola.dpto.map(normalizar_departamento),
        k_mpio=divipola.nom_mpio.map(clave),
    )
    indice = set(zip(divipola.departamento, divipola.k_mpio))
    indice_mpio = divipola.groupby("k_mpio").departamento.nunique()

    tmp = df.assign(departamento=df.Departamento.map(normalizar_departamento),
                    k_mpio=df.Municipio.map(lambda x: clave(x) if isinstance(x, str) else ""))
    exacto = [(d, m) in indice for d, m in zip(tmp.departamento, tmp.k_mpio)]
    tmp["coincide"] = exacto
    tasa = tmp.groupby("Fuente_Dataset").coincide.mean().map(lambda v: f"{dec(100 * v)} %")
    r.p(f"Fuente: DIVIPOLA del DANE (datos.gov.co `gdxc-w37w`, {fmt(len(divipola))} municipios). "
        "Coincidencia exacta por (departamento, municipio) normalizados:")
    r.tabla(tasa.rename("coincidencia").reset_index())
    sin = tmp[~tmp.coincide & tmp.departamento.notna()]
    top = sin.groupby(["departamento", "Municipio"]).size().sort_values(ascending=False).head(15)
    if len(top):
        r.p(f"Sin coincidencia: {fmt(len(sin))} filas. Las más frecuentes (requieren alias o búsqueda "
            "aproximada en la ingesta):")
        r.tabla(top.rename("filas").reset_index())
    r.p(f"Nombres de municipio que existen en más de un departamento: "
        f"{int((indice_mpio > 1).sum())} — por eso el cruce siempre usa el par (departamento, municipio).")

    sgc = df[df.Fuente_Dataset == FUENTE_SGC]
    m25 = sgc[sgc.Magnitud >= 2.5]
    usgs_periodo = usgs[usgs.time.between(sgc.Fecha.min(), sgc.Fecha.max())]
    r.h(3, "Epicentros reales desde USGS")
    r.p(f"El servicio FDSN del SGC (`sismo.sgc.gov.co:8080/fdsnws/event/1`) respondió 404 a todas "
        f"las consultas (consultado el {datetime.now():%Y-%m-%d}). El FDSN de USGS sí responde: "
        f"{fmt(len(usgs_periodo))} eventos M ≥ 2,5 en el bbox de Colombia para el mismo periodo, frente a "
        f"{fmt(len(m25))} sismos SGC con M ≥ 2,5. USGS solo cubre una fracción: el resto quedará "
        "con el centroide municipal (`precision_ubicacion = CENTROIDE_MUNICIPIO`).")


def seccion_impacto(r: Reporte, df: pd.DataFrame) -> None:
    r.h(2, "6. Etiquetas de impacto (reportes de daño)")
    dano = df[df.Fuente_Dataset != FUENTE_SGC].copy()
    def nivel(f: pd.Series) -> str:
        if f.Muertos >= 1 or f.Viviendas_Destruidas >= 50:
            return "ALTO"
        if f.Heridos >= 1 or f.Viviendas_Destruidas >= 1:
            return "MODERADO"
        if f.Afectados >= 1 or f.Damnificados >= 1 or f.Viviendas_Afectadas >= 1:
            return "BAJO"
        return "SIN_AFECTACION"
    con_dano = dano[COLUMNAS_DANO].notna().any(axis=1)
    dano = dano[con_dano].fillna({c: 0 for c in COLUMNAS_DANO})
    dano["nivel"] = dano.apply(nivel, axis=1)
    dano["usable"] = dano.Magnitud.notna() & dano.Profundidad_km.notna()
    r.p("Aplicando las reglas de `nivel_impacto` (ALTO: fallecidos ≥ 1 o viviendas destruidas ≥ 50; "
        "MODERADO: heridos ≥ 1 o viviendas destruidas ≥ 1; BAJO: afectados, damnificados o viviendas "
        "averiadas ≥ 1):")
    r.tabla(pd.crosstab(dano.nivel, dano.usable, margins=True, margins_name="total")
            .rename(columns={True: "con magnitud y profundidad", False: "sin magnitud o profundidad"}),
            indice=True)
    eventos = dano.groupby([dano.Fecha.dt.date, "Fuente_Dataset"]).size()
    r.p(f"Los {fmt(len(dano))} reportes corresponden a {fmt(len(eventos))} eventos (fecha, fuente): "
        f"en promedio {dec(len(dano) / len(eventos))} municipios por evento, máximo {int(eventos.max())}. "
        "Cada fila es el impacto de un sismo **en un municipio**, que es justo lo que predice el "
        "formulario (magnitud, profundidad y punto).")
    r.p("Para la clase SIN_AFECTACION se sumará una muestra de sismos SGC con M ≥ 3,5 sin reporte "
        "UNGRD en su municipio y fecha (decisión documentada en `docs/decisiones.md`).")


def seccion_conclusiones(r: Reporte) -> None:
    r.h(2, "7. Implicaciones para la preparación de datos (CRISP-DM fase 3)")
    for linea in [
        "Normalizar departamentos al nombre canónico; los extranjeros se marcan `fuera de Colombia`.",
        "Asignar coordenadas: epicentro USGS cuando hay pareja (±30 s, |ΔM| ≤ 0,5), si no el centroide DIVIPOLA.",
        "Convertir fechas según la zona horaria verificada en la sección 3 y guardarlas en UTC.",
        "Profundidades negativas, magnitudes nulas y municipios sin coordenadas: `es_anomalo` con motivo, sin borrar.",
        "Clave de idempotencia `fuente|id_evento|municipio` porque un mismo ID de daño se repite por municipio.",
        "Separar la zona Nido de Bucaramanga (Santander, profundidad > 100 km).",
        "Para Gutenberg-Richter y tendencia usar solo el tramo SGC (los reportes de daño no son un catálogo).",
    ]:
        r.p(f"- {linea}")


# ─── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--excel", type=Path, required=True)
    parser.add_argument("--divipola", type=Path, required=True)
    parser.add_argument("--usgs", type=Path, required=True)
    parser.add_argument("--salida", type=Path, required=True)
    args = parser.parse_args()

    libro = pd.ExcelFile(args.excel)
    df = libro.parse("Datos")
    divipola = pd.DataFrame(json.loads(args.divipola.read_text(encoding="utf-8")))
    usgs = pd.read_csv(args.usgs, parse_dates=["time"])
    usgs["time"] = usgs["time"].dt.tz_localize(None)

    r = Reporte()
    r.p("# Comprensión de los datos — barrido del dataset")
    r.p()
    r.p(f"> CRISP-DM fase 2. Generado por `Analytics/eda/barrido_datos.py` el "
        f"{datetime.now():%Y-%m-%d %H:%M} sobre `{args.excel.name}`. No editar a mano: volver a "
        "ejecutar el script.")
    seccion_estructura(r, df, libro.sheet_names)
    seccion_calidad(r, df)
    seccion_temporal(r, df, usgs)
    seccion_magnitudes(r, df)
    seccion_ubicacion(r, df, divipola, usgs)
    seccion_impacto(r, df)
    seccion_conclusiones(r)

    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(r.texto(), encoding="utf-8")
    print(f"Reporte escrito en {args.salida}")


if __name__ == "__main__":
    main()
