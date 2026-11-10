"""Modelo de nivel de impacto (fase 5 de CRISP-DM y fase 5 de la analítica).

Ejemplos de entrenamiento (decisiones D7 y D18):
- Reportes de daño de DesInventar y UNGRD con magnitud y profundidad, etiquetados
  con `nivel_impacto` (Analytics/config/umbrales_impacto.json). Cada reporte se
  asocia, si es posible, al epicentro de un sismo instrumental (SGC con epicentro,
  USGS o USGS_HIST) a ±1 día y ≤ 150 km del municipio; si no, el epicentro es el
  centroide del municipio (distancia epicentral 0).
- SIN_AFECTACION, en dos partes iguales:
  (a) controles del mismo evento: municipios a ≤ 150 km del epicentro de un sismo
      con reportes que no reportaron daño en ese evento (enseñan la atenuación
      con la distancia);
  (b) sismos SGC M ≥ 3,5 sin reporte en su municipio a ±1 día (D7).
  Ausencia de reporte ≠ ausencia de daño garantizada: es una suposición documentada.

Variables:
- Las 4 originales: magnitud, profundidad, latitud y longitud del municipio.
- Nuevas: distancia hipocentral y MMI estimada (Allen, Wald y Worden 2012, ver
  sismocol/intensidad.py), log10 de la población municipal 2018 y % urbano (DANE),
  y % de hogares con paredes inadecuadas (déficit habitacional CNPV 2018).

Se comparan con validación cruzada estratificada de 5 pliegues (los mismos para
todos): el Random Forest actual (4 variables), Random Forest y LightGBM con las
variables nuevas, un modelo ordinal (Frank y Hall 2001) y el baseline de clase
mayoritaria. Métricas fuera de pliegue: F1 macro, F1 por clase, matriz de
confusión, exactitud y Brier multiclase. El mejor se calibra
(CalibratedClassifierCV) y se reportan las curvas de confiabilidad. La
explicabilidad usa SHAP sobre el modelo sin calibrar.

Se despliega la versión calibrada salvo que su F1 macro caiga más de
TOLERANCIA_CALIBRACION respecto a la versión sin calibrar (con pocos datos la
calibración puede mover el argmax); la decisión queda en el reporte.

Regla de activación: el modelo nuevo solo se activa si su F1 macro supera al del
modelo vigente evaluado con los mismos pliegues (o si no hay ninguno activo).
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.base import BaseEstimator, ClassifierMixin, clone
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sqlalchemy import func, insert, select, update

from sismocol import db
from sismocol.config import RAIZ_ANALYTICS, Ajustes
from sismocol.fuentes import dane
from sismocol.geo import haversine_km
from sismocol.intensidad import DISTANCIA_MAXIMA_KM, distancia_hipocentral, mmi_allen2012
from sismocol.municipios import ResolvedorMunicipios

log = logging.getLogger("sismocol.modelo")

CLASES = ["SIN_AFECTACION", "BAJO", "MODERADO", "ALTO"]
CARACTERISTICAS = ["magnitud", "profundidad_km", "latitud", "longitud"]  # modelo original (v1)
VARIABLES_NUEVAS = ["distancia_hipocentral_km", "mmi", "log_poblacion", "pct_urbano", "pct_paredes_inadecuadas"]
VARIABLES_CONTEXTO = {"log_poblacion": "poblacion", "pct_urbano": "poblacion", "pct_paredes_inadecuadas": "vulnerabilidad"}
ETIQUETAS_VARIABLE = {
    "magnitud": "Magnitud", "profundidad_km": "Profundidad (km)", "latitud": "Latitud del municipio",
    "longitud": "Longitud del municipio", "distancia_hipocentral_km": "Distancia hipocentral (km)",
    "mmi": "Intensidad estimada (MMI)", "log_poblacion": "Población (log10)", "pct_urbano": "Población urbana (%)",
    "pct_paredes_inadecuadas": "Hogares con paredes inadecuadas (%)",
}
DIR_MODELOS = RAIZ_ANALYTICS / "models"
SEMILLA = 42
PLIEGUES = 5
MIN_EJEMPLOS = 30
MIN_POR_CLASE = 4
MAGNITUD_MIN_SIN_AFECTACION = 3.5
PROPORCION_SIN_AFECTACION = 2  # SIN_AFECTACION por cada reporte con daño (mitad controles, mitad SGC)
DIAS_ASOCIACION = 1
ASOCIACION_MAX_KM = 150.0
ASOCIACION_DELTA_M = 0.6
RADIO_CONTROLES_KM = 150.0
MMI_MINIMA_ESCENARIO = 3.0
BINS_CONFIABILIDAD = 10
MUESTRA_SHAP = 300
TOLERANCIA_CALIBRACION = 0.01
BASELINE = "Baseline (clase mayoritaria)"
ESQUEMA = 2


class DatosInsuficientes(LookupError):
    pass


class SinModeloActivo(LookupError):
    pass


# ─── Modelo ordinal ─────────────────────────────────────────────────────────

class OrdinalFrankHall(ClassifierMixin, BaseEstimator):
    """Clasificación ordinal de Frank y Hall (2001): un clasificador binario por
    umbral P(y > k) y P(y = k) = P(y > k−1) − P(y > k), recortado a [0, 1] y
    renormalizado. Las etiquetas son enteros en orden de severidad (ver _codigos)."""

    def __init__(self, base=None):
        self.base = base

    def fit(self, x, y):
        y = np.asarray(y)
        self.classes_ = np.unique(y)
        rango = {c: i for i, c in enumerate(self.classes_)}
        r = np.array([rango[v] for v in y])
        base = self.base if self.base is not None else LGBMClassifier(verbose=-1, random_state=SEMILLA)
        self.modelos_ = [clone(base).fit(x, (r > k).astype(int)) for k in range(len(self.classes_) - 1)]
        return self

    def predict_proba(self, x):
        mayor = np.column_stack([m.predict_proba(x)[:, 1] for m in self.modelos_])
        acum = np.column_stack([np.ones(len(x)), mayor, np.zeros(len(x))])
        p = np.clip(acum[:, :-1] - acum[:, 1:], 0, None)
        suma = p.sum(axis=1, keepdims=True)
        return np.where(suma > 0, p / np.where(suma > 0, suma, 1), 1 / p.shape[1])

    def predict(self, x):
        return self.classes_[np.argmax(self.predict_proba(x), axis=1)]


def _codigos(niveles) -> np.ndarray:
    """Niveles → enteros en orden de severidad (0 = SIN_AFECTACION … 3 = ALTO). Así el
    orden se conserva aunque CalibratedClassifierCV y cross_val_predict reordenen las clases."""
    return np.array([CLASES.index(str(v)) for v in niveles])


def _nombres(clases_modelo) -> list[str]:
    """classes_ de un modelo → nombres (los modelos v1 se entrenaron con nombres)."""
    return [CLASES[int(c)] if isinstance(c, (int, np.integer)) else str(c) for c in clases_modelo]


def _lightgbm() -> LGBMClassifier:
    return LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=15, min_child_samples=10,
                          subsample=0.9, subsample_freq=1, colsample_bytree=0.9, class_weight="balanced",
                          random_state=SEMILLA, verbose=-1)


def _random_forest() -> RandomForestClassifier:
    return RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced",
                                  random_state=SEMILLA, n_jobs=-1)


@dataclass(frozen=True)
class Candidato:
    nombre: str
    estimador: object
    caracteristicas: list[str]


def candidatos(nuevas: list[str]) -> list[Candidato]:
    completas = [*CARACTERISTICAS, *nuevas]
    return [
        Candidato("Random Forest (actual, 4 variables)", _random_forest(), list(CARACTERISTICAS)),
        Candidato("Random Forest + variables nuevas", _random_forest(), completas),
        Candidato("LightGBM + variables nuevas", _lightgbm(), completas),
        Candidato("Ordinal Frank-Hall (LightGBM)",
                  OrdinalFrankHall(LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=15,
                                                  min_child_samples=10, class_weight="balanced",
                                                  random_state=SEMILLA, verbose=-1)), completas),
    ]


# ─── Contexto municipal ─────────────────────────────────────────────────────

@dataclass
class ContextoMunicipal:
    """Centroides DIVIPOLA + población y vulnerabilidad DANE por código de municipio."""
    tabla: pd.DataFrame  # índice: codigo
    disponibles: list[str]  # variables de contexto con datos
    avisos: list[str] = field(default_factory=list)

    @classmethod
    def construir(cls, municipios: pd.DataFrame, poblacion: pd.DataFrame | None,
                  vulnerabilidad: pd.DataFrame | None, avisos: list[str] | None = None) -> "ContextoMunicipal":
        t = municipios.set_index("codigo").copy()
        disponibles: list[str] = []
        avisos = list(avisos or [])
        if poblacion is not None:
            p = poblacion.set_index("codigo")
            t["log_poblacion"] = np.log10(p.poblacion.reindex(t.index).astype(float).clip(lower=1))
            t["pct_urbano"] = p.pct_urbano.reindex(t.index).astype(float)
            disponibles += ["log_poblacion", "pct_urbano"]
        if vulnerabilidad is not None:
            t["pct_paredes_inadecuadas"] = vulnerabilidad.set_index("codigo").pct_paredes_inadecuadas \
                .reindex(t.index).astype(float)
            disponibles.append("pct_paredes_inadecuadas")
        for col in disponibles:
            faltan = int(t[col].isna().sum())
            if faltan:
                # Municipios sin dato (p. ej. creados después de 2018): mediana nacional.
                avisos.append(f"{col}: {faltan} municipios sin dato, se usa la mediana nacional")
                t[col] = t[col].fillna(t[col].median())
        return cls(t, disponibles, avisos)

    @classmethod
    def cargar(cls, ajustes: Ajustes, resolvedor: ResolvedorMunicipios) -> "ContextoMunicipal":
        poblacion, vulnerabilidad, avisos = dane.cargar(ajustes.dir_referencias, ajustes.http_timeout_s)
        return cls.construir(resolvedor.tabla, poblacion, vulnerabilidad, avisos)

    def variables(self) -> list[str]:
        """Variables nuevas disponibles (la densidad no: falta el área municipal, D18)."""
        return ["distancia_hipocentral_km", "mmi", *[v for v in VARIABLES_NUEVAS if v in self.disponibles]]


def construir_variables(df: pd.DataFrame, contexto: ContextoMunicipal) -> pd.DataFrame:
    """A partir de magnitud, profundidad_km, codigo (municipio) y epi_lat/epi_lon."""
    t = contexto.tabla.reindex(df.codigo.to_numpy())
    salida = df.copy()
    salida["latitud"] = t.latitud.to_numpy(float)
    salida["longitud"] = t.longitud.to_numpy(float)
    salida["distancia_hipocentral_km"] = distancia_hipocentral(
        salida.epi_lat.to_numpy(float), salida.epi_lon.to_numpy(float), salida.profundidad_km.to_numpy(float),
        salida.latitud.to_numpy(float), salida.longitud.to_numpy(float))
    salida["mmi"] = mmi_allen2012(salida.magnitud.to_numpy(float), salida.distancia_hipocentral_km.to_numpy(float))
    for col in contexto.disponibles:
        salida[col] = t[col].to_numpy(float)
    return salida


# ─── Datos ──────────────────────────────────────────────────────────────────

def _instrumentales(url: str) -> pd.DataFrame:
    """Eventos con epicentro real para asociar a los reportes de daño."""
    t = db.tablas(url)["registro_sismico"]
    consulta = (select(t.c.id_sismo, t.c.fecha_hora, t.c.latitud, t.c.longitud, t.c.magnitud, t.c.profundidad_km)
                .where(t.c.fuente.in_(["SGC", "USGS", "USGS_HIST"]), t.c.es_anomalo.is_(False),
                       t.c.precision_ubicacion == "EPICENTRO", t.c.magnitud >= 3.0,
                       t.c.latitud.is_not(None), t.c.longitud.is_not(None)))
    with db.motor(url).connect() as c:
        df = pd.DataFrame(c.execute(consulta).all(),
                          columns=["id_sismo", "fecha_hora", "latitud", "longitud", "magnitud", "profundidad_km"])
    for col in ("latitud", "longitud", "magnitud", "profundidad_km"):
        df[col] = pd.to_numeric(df[col]).astype(float)
    df["fecha_hora"] = pd.to_datetime(df["fecha_hora"])
    return df.sort_values("fecha_hora").reset_index(drop=True)


def asociar_epicentros(reportes: pd.DataFrame, eventos: pd.DataFrame, contexto: ContextoMunicipal) -> pd.DataFrame:
    """Epicentro del sismo instrumental más parecido (|ΔM| mínima, luego mayor M) a ±1 día
    del día local del reporte y ≤ 150 km del municipio. Sin pareja: centroide del municipio."""
    r = reportes.copy()
    centro = contexto.tabla.reindex(r.codigo.to_numpy())
    r["epi_lat"], r["epi_lon"] = centro.latitud.to_numpy(float), centro.longitud.to_numpy(float)
    r["id_evento"] = None
    r["epicentro_asociado"] = False
    if eventos.empty:
        return r
    t_ev = eventos.fecha_hora.to_numpy()
    for i in r.index:
        dia = pd.Timestamp(r.at[i, "fecha_hora"])
        desde = np.searchsorted(t_ev, (dia - timedelta(days=DIAS_ASOCIACION)).to_datetime64())
        hasta = np.searchsorted(t_ev, (dia + timedelta(days=DIAS_ASOCIACION + 1)).to_datetime64())
        ventana = eventos.iloc[desde:hasta]
        if ventana.empty or np.isnan(r.at[i, "epi_lat"]):
            continue
        d = haversine_km(r.at[i, "epi_lat"], r.at[i, "epi_lon"], ventana.latitud.to_numpy(), ventana.longitud.to_numpy())
        dm = np.abs(ventana.magnitud.to_numpy() - float(r.at[i, "magnitud"]))
        ok = (d <= ASOCIACION_MAX_KM) & (dm <= ASOCIACION_DELTA_M)
        if not ok.any():
            continue
        candidatos_ok = ventana[ok].assign(dm=dm[ok]).sort_values(["dm", "magnitud"], ascending=[True, False])
        mejor = candidatos_ok.iloc[0]
        r.at[i, "epi_lat"], r.at[i, "epi_lon"] = float(mejor.latitud), float(mejor.longitud)
        r.at[i, "id_evento"] = int(mejor.id_sismo)
        r.at[i, "epicentro_asociado"] = True
    return r


def controles_mismo_evento(positivos: pd.DataFrame, contexto: ContextoMunicipal, cupo: int,
                           rng: np.random.Generator) -> pd.DataFrame:
    """Municipios a ≤ RADIO_CONTROLES_KM del epicentro de cada evento con reportes que no reportaron daño."""
    asociados = positivos[positivos.epicentro_asociado]
    filas = []
    tabla = contexto.tabla
    for id_evento, g in asociados.groupby("id_evento"):
        ref = g.iloc[0]
        d = haversine_km(ref.epi_lat, ref.epi_lon, tabla.latitud.to_numpy(float), tabla.longitud.to_numpy(float))
        cerca = tabla.index[(d <= RADIO_CONTROLES_KM) & ~tabla.index.isin(set(g.codigo))]
        for codigo in cerca:
            filas.append({"fecha_hora": ref.fecha_hora, "codigo": codigo, "magnitud": ref.magnitud,
                          "profundidad_km": ref.profundidad_km, "epi_lat": ref.epi_lat, "epi_lon": ref.epi_lon,
                          "id_evento": id_evento, "epicentro_asociado": True})
    controles = pd.DataFrame(filas)
    if len(controles) > cupo:
        controles = controles.iloc[rng.choice(len(controles), size=cupo, replace=False)]
    return controles.assign(nivel="SIN_AFECTACION", origen="CONTROL_MISMO_EVENTO")


def _codigo(res: ResolvedorMunicipios, departamento, municipio, lat, lon) -> str | None:
    m = res.resolver(departamento, municipio)
    if m is None and pd.notna(lat) and pd.notna(lon):
        cercano = res.mas_cercano(float(lat), float(lon))
        m = cercano[0] if cercano else None
    return m.codigo if m is not None else None


def _sin_reporte(sgc: pd.DataFrame, reportes: pd.DataFrame) -> pd.DataFrame:
    """Sismos SGC sin reporte de daño en su municipio a ±1 día (D7)."""
    dias_reporte: dict[str, list[pd.Timestamp]] = {}
    for k, fecha in zip(reportes.codigo, pd.to_datetime(reportes.fecha_hora)):
        dias_reporte.setdefault(k, []).append(fecha)
    ventana = timedelta(days=DIAS_ASOCIACION + 1)
    conserva = [not any(abs(fecha - f) <= ventana for f in dias_reporte.get(k, ()))
                for k, fecha in zip(sgc.codigo, pd.to_datetime(sgc.fecha_hora))]
    return sgc[conserva]


def ejemplos(url: str, contexto: ContextoMunicipal, res: ResolvedorMunicipios) -> pd.DataFrame:
    """Tabla de entrenamiento con todas las variables, `nivel` y `origen`."""
    t = db.tablas(url)["registro_sismico"]
    columnas = [t.c.fecha_hora, t.c.municipio, t.c.departamento, t.c.latitud, t.c.longitud, t.c.magnitud,
                t.c.profundidad_km, t.c.precision_ubicacion]
    completos = [t.c.magnitud.is_not(None), t.c.profundidad_km.is_not(None)]
    nombres = ["fecha_hora", "municipio", "departamento", "latitud", "longitud", "magnitud", "profundidad_km", "precision"]
    with db.motor(url).connect() as c:
        reportes = pd.DataFrame(c.execute(
            select(*columnas, t.c.nivel_impacto)
            .where(t.c.fuente.in_(["DESINVENTAR", "UNGRD"]), t.c.es_anomalo.is_(False),
                   t.c.nivel_impacto.is_not(None), *completos)).all(), columns=[*nombres, "nivel"])
        sgc = pd.DataFrame(c.execute(
            select(*columnas)
            .where(t.c.fuente == "SGC", t.c.es_anomalo.is_(False), t.c.magnitud >= MAGNITUD_MIN_SIN_AFECTACION,
                   t.c.latitud.is_not(None), *completos)).all(), columns=nombres)
    if reportes.empty:
        raise DatosInsuficientes("No hay reportes de daño (DesInventar/UNGRD) con magnitud y profundidad. "
                                 "Cargue el Excel completo o sincronice con la UNGRD.")
    for df in (reportes, sgc):
        for col in ("latitud", "longitud", "magnitud", "profundidad_km"):
            df[col] = pd.to_numeric(df[col]).astype(float)
        df["fecha_hora"] = pd.to_datetime(df["fecha_hora"])
        df["codigo"] = [_codigo(res, d, m, la, lo) for d, m, la, lo in
                        zip(df.departamento, df.municipio, df.latitud, df.longitud)]
    reportes = reportes[reportes.codigo.notna()]
    sgc = sgc[sgc.codigo.notna()]

    positivos = asociar_epicentros(reportes, _instrumentales(url), contexto).assign(origen="REPORTE")
    rng = np.random.default_rng(SEMILLA)
    cupo = PROPORCION_SIN_AFECTACION * int((positivos.nivel != "SIN_AFECTACION").sum())
    controles = controles_mismo_evento(positivos, contexto, cupo // 2, rng)

    sin_reporte = _sin_reporte(sgc, reportes) if not sgc.empty else sgc
    cupo_sgc = cupo - len(controles)
    if len(sin_reporte) > cupo_sgc > 0:
        sin_reporte = sin_reporte.sample(n=cupo_sgc, random_state=SEMILLA)
    # Epicentro: el del SGC si lo tiene; si no, el centroide de su municipio.
    centro = contexto.tabla.reindex(sin_reporte.codigo.to_numpy())
    con_epi = (sin_reporte.precision == "EPICENTRO").to_numpy()
    sin_reporte = sin_reporte.assign(
        epi_lat=np.where(con_epi, sin_reporte.latitud, centro.latitud.to_numpy(float)),
        epi_lon=np.where(con_epi, sin_reporte.longitud, centro.longitud.to_numpy(float)),
        epicentro_asociado=con_epi, id_evento=None, nivel="SIN_AFECTACION", origen="SGC_SIN_REPORTE")

    columnas_finales = ["fecha_hora", "codigo", "magnitud", "profundidad_km", "epi_lat", "epi_lon",
                        "epicentro_asociado", "nivel", "origen"]
    datos = pd.concat([positivos[columnas_finales], controles.reindex(columns=columnas_finales),
                       sin_reporte[columnas_finales]], ignore_index=True)
    datos = construir_variables(datos, contexto)
    return datos.dropna(subset=[*CARACTERISTICAS, *contexto.variables()]).reset_index(drop=True)


# ─── Evaluación ─────────────────────────────────────────────────────────────

def brier_multiclase(y: np.ndarray, proba: np.ndarray, clases: list[str]) -> float:
    """Media sobre ejemplos de Σ_k (p_k − 1[y = k])²."""
    uno = (np.asarray(y)[:, None] == np.asarray(clases)[None, :]).astype(float)
    return float(np.mean(np.sum((proba - uno) ** 2, axis=1)))


def _proba_ordenada(proba: np.ndarray, clases_modelo, clases: list[str]) -> np.ndarray:
    salida = np.zeros((proba.shape[0], len(clases)))
    for j, c in enumerate(clases_modelo):
        salida[:, clases.index(str(c))] = proba[:, j]
    return salida


def metricas(y: np.ndarray, proba: np.ndarray, clases: list[str]) -> dict[str, object]:
    pred = np.asarray(clases)[np.argmax(proba, axis=1)]
    precision, recall, f1, soporte = precision_recall_fscore_support(y, pred, labels=CLASES, zero_division=0)
    return {
        "f1Macro": round(float(f1_score(y, pred, average="macro", labels=clases, zero_division=0)), 4),
        "exactitud": round(float(accuracy_score(y, pred)), 4),
        "brier": round(brier_multiclase(y, proba, clases), 4),
        "matrizConfusion": confusion_matrix(y, pred, labels=CLASES).tolist(),
        "porClase": {c: {"precision": round(float(precision[i]), 4), "recall": round(float(recall[i]), 4),
                         "f1": round(float(f1[i]), 4), "soporte": int(soporte[i])} for i, c in enumerate(CLASES)},
    }


def _oof(estimador, x: np.ndarray, y: np.ndarray, pliegues, clases: list[str]) -> np.ndarray:
    proba = cross_val_predict(estimador, x, y, cv=pliegues, method="predict_proba")
    # cross_val_predict ordena las columnas como np.unique(y): con códigos, en orden de severidad.
    return _proba_ordenada(proba, _nombres(np.unique(y)), clases)


def confiabilidad(y: np.ndarray, proba: np.ndarray, clases: list[str]) -> dict[str, list[dict[str, float]]]:
    """Curva de confiabilidad uno-contra-resto por clase (bins por cuantiles)."""
    curvas = {}
    for j, c in enumerate(clases):
        objetivo = (np.asarray(y) == c).astype(int)
        if objetivo.sum() == 0 or objetivo.sum() == len(objetivo):
            continue
        observada, predicha = calibration_curve(objetivo, proba[:, j], n_bins=BINS_CONFIABILIDAD, strategy="quantile")
        curvas[c] = [{"predicha": round(float(p), 4), "observada": round(float(o), 4)} for p, o in zip(predicha, observada)]
    return curvas


@dataclass
class ResultadoEntrenamiento:
    algoritmo: str
    modelo: object  # calibrado
    explicador: object  # mismo algoritmo sin calibrar (SHAP)
    caracteristicas: list[str]
    exactitud: float
    f1_macro: float
    reporte: dict[str, object]
    pliegues: object = None
    clases: list[str] = field(default_factory=list)


def _pliegues(y: np.ndarray) -> StratifiedKFold:
    return StratifiedKFold(n_splits=min(PLIEGUES, int(pd.Series(y).value_counts().min())), shuffle=True,
                           random_state=SEMILLA)


def entrenar_y_evaluar(datos: pd.DataFrame, nuevas: list[str] | None = None) -> ResultadoEntrenamiento:
    """Compara los candidatos con los mismos pliegues, calibra el mejor y lo reentrena con todo."""
    nuevas = [v for v in (nuevas if nuevas is not None else VARIABLES_NUEVAS) if v in datos.columns]
    conteo = datos.nivel.value_counts()
    clases = [c for c in CLASES if conteo.get(c, 0) >= MIN_POR_CLASE]
    datos = datos[datos.nivel.isin(clases)].reset_index(drop=True)
    if len(datos) < MIN_EJEMPLOS or len(clases) < 2:
        raise DatosInsuficientes(
            f"Se necesitan al menos {MIN_EJEMPLOS} ejemplos y 2 niveles con {MIN_POR_CLASE}+ casos "
            f"(hay {len(datos)}: {conteo.to_dict()}).")
    y_nombres = datos.nivel.to_numpy()
    y = _codigos(y_nombres)
    pliegues = _pliegues(y)

    comparacion, oof = [], {}
    for cand in candidatos(nuevas):
        x = datos[cand.caracteristicas].to_numpy(float)
        proba = _oof(clone(cand.estimador), x, y, pliegues, clases)
        oof[cand.nombre] = proba
        comparacion.append({"algoritmo": cand.nombre, "caracteristicas": cand.caracteristicas,
                            **metricas(y_nombres, proba, clases)})
    proba_base = _oof(DummyClassifier(strategy="prior"), datos[CARACTERISTICAS].to_numpy(float), y, pliegues, clases)
    comparacion.append({"algoritmo": BASELINE, "caracteristicas": [], **metricas(y_nombres, proba_base, clases)})

    elegido = max((c for c in comparacion if c["algoritmo"] != BASELINE), key=lambda c: c["f1Macro"])
    cand = next(c for c in candidatos(nuevas) if c.nombre == elegido["algoritmo"])
    x = datos[cand.caracteristicas].to_numpy(float)
    metodo = "isotonic" if len(datos) >= 1000 else "sigmoid"
    calibrador = CalibratedClassifierCV(clone(cand.estimador), method=metodo, cv=3)
    proba_cal = _oof(calibrador, x, y, pliegues, clases)
    m_cal = metricas(y_nombres, proba_cal, clases)

    explicador = clone(cand.estimador).fit(x, y)
    calibrado = m_cal["f1Macro"] >= elegido["f1Macro"] - TOLERANCIA_CALIBRACION
    final = CalibratedClassifierCV(clone(cand.estimador), method=metodo, cv=pliegues).fit(x, y) if calibrado \
        else explicador
    desplegado = m_cal if calibrado else {k: v for k, v in elegido.items() if k not in ("algoritmo", "caracteristicas")}
    reporte = {
        "clases": CLASES,
        "validacion": f"Validación cruzada estratificada de {pliegues.get_n_splits()} pliegues (predicciones fuera de pliegue)",
        "comparacion": [{k: v for k, v in c.items() if k not in ("matrizConfusion",)} for c in comparacion],
        "elegido": cand.nombre,
        "caracteristicas": cand.caracteristicas,
        "sinCalibrar": {k: v for k, v in elegido.items() if k not in ("algoritmo", "caracteristicas")},
        "calibracion": {"metodo": metodo, **m_cal},
        "desplegado": "calibrado" if calibrado else "sin calibrar",
        "criterioDespliegue": f"Calibrado salvo que su F1 macro caiga más de {TOLERANCIA_CALIBRACION} frente al modelo sin calibrar",
        "confiabilidad": {"sinCalibrar": confiabilidad(y_nombres, oof[cand.nombre], clases),
                          "calibrado": confiabilidad(y_nombres, proba_cal, clases)},
        # Compatibilidad con la vista anterior: matriz y por clase del modelo desplegado.
        "matrizConfusion": desplegado["matrizConfusion"],
        "porClase": desplegado["porClase"],
        "composicion": datos.groupby(["origen", "nivel"]).size().unstack(fill_value=0).to_dict(orient="index")
        if "origen" in datos else {},
        "ejemplos": int(len(datos)),
        "reportesConEpicentro": int(datos[datos.get("origen", pd.Series(dtype=str)) == "REPORTE"]
                                    .get("epicentro_asociado", pd.Series(dtype=bool)).fillna(False).astype(bool).sum())
        if "origen" in datos else 0,
        "reportes": int((datos.origen == "REPORTE").sum()) if "origen" in datos else int(len(datos)),
    }
    try:
        reporte["shap"] = shap_global(explicador, datos[cand.caracteristicas], cand.caracteristicas, clases)
    except Exception as error:  # SHAP no debe impedir el entrenamiento
        log.warning("SHAP global no disponible: %s", error)
        reporte["shap"] = None
    return ResultadoEntrenamiento(cand.nombre, final, explicador, cand.caracteristicas, desplegado["exactitud"],
                                  desplegado["f1Macro"], reporte, pliegues, clases)


# ─── SHAP ───────────────────────────────────────────────────────────────────

def _es_arbol(modelo) -> bool:
    return isinstance(modelo, (RandomForestClassifier, LGBMClassifier))


def _valores_shap(modelo, x: pd.DataFrame, fondo: pd.DataFrame | None = None) -> np.ndarray:
    """Arreglo (n, variables, clases) de contribuciones a la probabilidad de cada clase."""
    import shap

    if _es_arbol(modelo):
        explainer = shap.TreeExplainer(modelo, model_output="raw") if isinstance(modelo, RandomForestClassifier) \
            else shap.TreeExplainer(modelo)
        valores = explainer.shap_values(x)
    else:
        fondo = fondo if fondo is not None else x.sample(min(len(x), 100), random_state=SEMILLA)
        explainer = shap.PermutationExplainer(lambda z: modelo.predict_proba(pd.DataFrame(z, columns=x.columns).to_numpy()),
                                              fondo.to_numpy())
        valores = explainer(x.to_numpy(), silent=True).values
    v = np.asarray(valores)
    if isinstance(valores, list):
        v = np.stack(valores, axis=-1)
    if v.ndim == 2:  # binario: una sola salida
        v = np.stack([-v, v], axis=-1)
    return v


def shap_global(modelo, x: pd.DataFrame, caracteristicas: list[str], clases: list[str]) -> dict[str, object]:
    muestra = x.sample(min(len(x), MUESTRA_SHAP), random_state=SEMILLA)
    v = _valores_shap(modelo, muestra.astype(float))
    importancia = np.abs(v).mean(axis=0)  # (variables, clases)
    total = importancia.sum(axis=1)
    orden = np.argsort(-total)
    clases_modelo = _nombres(modelo.classes_)
    return {
        "metodo": "TreeExplainer" if _es_arbol(modelo) else "PermutationExplainer",
        "salida": "log-odds (LightGBM) o probabilidad (Random Forest y ordinal), modelo sin calibrar",
        "muestra": int(len(muestra)),
        "importancia": [{
            "variable": caracteristicas[i], "etiqueta": ETIQUETAS_VARIABLE.get(caracteristicas[i], caracteristicas[i]),
            "media": round(float(total[i]), 5),
            "porClase": {clases_modelo[k]: round(float(importancia[i, k]), 5) for k in range(len(clases_modelo))},
        } for i in orden],
    }


def explicar(paquete: dict, fila: pd.DataFrame, clase: str) -> list[dict[str, object]]:
    """Contribución SHAP de cada variable a la clase predicha para una predicción."""
    modelo = paquete["explicador"]
    v = _valores_shap(modelo, fila.astype(float), paquete.get("fondo"))
    k = _nombres(modelo.classes_).index(clase)
    salida = [{"variable": c, "etiqueta": ETIQUETAS_VARIABLE.get(c, c), "valor": round(float(fila[c].iloc[0]), 4),
               "contribucion": round(float(v[0, i, k]), 5)} for i, c in enumerate(fila.columns)]
    return sorted(salida, key=lambda d: -abs(d["contribucion"]))


# ─── Entrenamiento y versiones ──────────────────────────────────────────────

_entrenando = threading.Lock()


def _fila_modelo(fila) -> dict[str, object]:
    return {
        "idModelo": fila.id_modelo, "version": fila.version, "algoritmo": fila.algoritmo,
        "exactitud": float(fila.exactitud), "f1Macro": float(fila.f1_macro), "activo": bool(fila.activo),
        "fechaEntrenamiento": pd.Timestamp(fila.fecha_entrenamiento).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }


def _cargar_paquete(fila) -> dict:
    ruta = RAIZ_ANALYTICS / fila.ruta_archivo
    if fila.ruta_archivo not in _cargados:
        if not ruta.exists():
            raise SinModeloActivo(f"No se encuentra el archivo del modelo {fila.version}. Vuelva a entrenarlo.")
        _cargados[fila.ruta_archivo] = joblib.load(ruta)
    return _cargados[fila.ruta_archivo]  # type: ignore[return-value]


def evaluar_vigente(paquete: dict, datos: pd.DataFrame, resultado: ResultadoEntrenamiento) -> dict[str, object] | None:
    """F1 macro del modelo vigente tal como está desplegado (mismo algoritmo, variables y,
    si aplica, calibración), reentrenado y evaluado con los mismos pliegues."""
    caracteristicas = paquete.get("caracteristicas", CARACTERISTICAS)
    if not set(caracteristicas) <= set(datos.columns):
        return None
    estimador = clone(paquete["modelo"])
    if isinstance(estimador, CalibratedClassifierCV):
        estimador.set_params(cv=3)  # misma calibración que en la evaluación del candidato
    datos = datos[datos.nivel.isin(resultado.clases)].reset_index(drop=True)
    proba = _oof(estimador, datos[caracteristicas].to_numpy(float), _codigos(datos.nivel),
                 resultado.pliegues, resultado.clases)
    return metricas(datos.nivel.to_numpy(), proba, resultado.clases)


def entrenar(ajustes: Ajustes, resolvedor: ResolvedorMunicipios) -> dict[str, object]:
    """Entrena, guarda el archivo y registra el modelo. Se activa si supera al vigente en F1 macro."""
    if not _entrenando.acquire(blocking=False):
        raise DatosInsuficientes("Ya hay un entrenamiento en curso. Espere a que termine.")
    url = ajustes.database_url
    try:
        contexto = ContextoMunicipal.cargar(ajustes, resolvedor)
        datos = ejemplos(url, contexto, resolvedor)
        resultado = entrenar_y_evaluar(datos, contexto.variables())
        resultado.reporte["avisosDatos"] = contexto.avisos + [
            "Densidad de población no incluida: el área municipal (MGN del DANE) no se pudo descargar."]
        t = db.tablas(url)["modelo_predictivo"]
        with db.motor(url).connect() as c:
            vigente = c.execute(select(t).where(t.c.activo.is_(True)).limit(1)).first()
        activar, comparacion_vigente = True, None
        if vigente is not None:
            try:
                comparacion_vigente = evaluar_vigente(_cargar_paquete(vigente), datos, resultado)
            except Exception as error:
                log.warning("No se pudo evaluar el modelo vigente: %s", error)
            # Si no se puede reevaluar con los mismos pliegues, se compara con el F1 registrado.
            referencia = comparacion_vigente["f1Macro"] if comparacion_vigente else float(vigente.f1_macro)
            activar = resultado.f1_macro > referencia
        resultado.reporte["activacion"] = {
            "regla": "Se activa solo si su F1 macro supera al del modelo vigente con los mismos pliegues",
            "vigente": None if vigente is None else {"version": vigente.version, "algoritmo": vigente.algoritmo,
                                                     "f1Macro": None if comparacion_vigente is None else comparacion_vigente["f1Macro"],
                                                     "f1MacroRegistrado": float(vigente.f1_macro)},
            "comparadoCon": "mismos pliegues" if vigente is None or comparacion_vigente else "F1 registrado del vigente",
            "f1MacroNuevo": resultado.f1_macro, "activado": activar,
        }
        x = datos[resultado.caracteristicas].astype(float)
        with db.motor(url).begin() as c:
            n = c.execute(select(func.count()).select_from(t)).scalar_one()
            version = f"v2.{n}.0"
            DIR_MODELOS.mkdir(parents=True, exist_ok=True)
            archivo = DIR_MODELOS / f"impacto_{version}.joblib"
            joblib.dump({"modelo": resultado.modelo, "explicador": resultado.explicador,
                         "caracteristicas": resultado.caracteristicas, "esquema": ESQUEMA,
                         "fondo": x.sample(min(len(x), 100), random_state=SEMILLA)}, archivo)
            if activar:
                c.execute(update(t).where(t.c.activo.is_(True)).values(activo=False))
            id_modelo = c.execute(insert(t).values(
                version=version, algoritmo=resultado.algoritmo[:50],
                ruta_archivo=str(archivo.relative_to(RAIZ_ANALYTICS)),
                exactitud=round(resultado.exactitud, 4), f1_macro=round(resultado.f1_macro, 4), activo=activar,
                caracteristicas=json.dumps(resultado.caracteristicas), reporte=json.dumps(resultado.reporte),
                fecha_entrenamiento=datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0),
            )).inserted_primary_key[0]
            fila = c.execute(select(t).where(t.c.id_modelo == id_modelo)).one()
        log.info("Modelo %s entrenado: %s, F1 macro %.3f, activo=%s", version, resultado.algoritmo,
                 resultado.f1_macro, activar)
        return {"modelo": _fila_modelo(fila), "reporte": resultado.reporte}
    finally:
        _entrenando.release()


def reporte_modelo(url: str, id_modelo: int) -> dict[str, object]:
    t = db.tablas(url)["modelo_predictivo"]
    with db.motor(url).connect() as c:
        fila = c.execute(select(t).where(t.c.id_modelo == id_modelo)).first()
    if fila is None:
        raise SinModeloActivo(f"No existe el modelo {id_modelo}")
    rep = fila.reporte
    return {"modelo": _fila_modelo(fila), "reporte": json.loads(rep) if isinstance(rep, (str, bytes)) else rep}


# ─── Predicción y escenarios ────────────────────────────────────────────────

_cargados: dict[str, object] = {}
_contextos: dict[str, ContextoMunicipal] = {}


def _vigente(url: str):
    t = db.tablas(url)["modelo_predictivo"]
    with db.motor(url).connect() as c:
        fila = c.execute(select(t).where(t.c.activo.is_(True)).limit(1)).first()
    if fila is None:
        raise SinModeloActivo("No hay un modelo de impacto activo. Entrénelo en Administración → Datos y modelo.")
    return fila, _cargar_paquete(fila)


def contexto(ajustes: Ajustes, resolvedor: ResolvedorMunicipios) -> ContextoMunicipal:
    llave = str(ajustes.dir_referencias)
    if llave not in _contextos:
        _contextos[llave] = ContextoMunicipal.cargar(ajustes, resolvedor)
    return _contextos[llave]


def _probabilidades(modelo, x: np.ndarray) -> np.ndarray:
    return _proba_ordenada(modelo.predict_proba(x), _nombres(modelo.classes_), CLASES)


def predecir(ajustes: Ajustes, resolvedor: ResolvedorMunicipios, magnitud: float, profundidad_km: float,
             latitud: float, longitud: float) -> dict[str, object]:
    fila, paquete = _vigente(ajustes.database_url)
    modelo = paquete["modelo"]  # type: ignore[index]
    caracteristicas = paquete.get("caracteristicas", CARACTERISTICAS)  # type: ignore[union-attr]
    extra: dict[str, object] = {}
    if paquete.get("esquema", 1) >= ESQUEMA:  # type: ignore[union-attr]
        # El impacto se estima en el municipio más cercano al punto elegido.
        ctx = contexto(ajustes, resolvedor)
        d = haversine_km(latitud, longitud, ctx.tabla.latitud.to_numpy(float), ctx.tabla.longitud.to_numpy(float))
        codigo = ctx.tabla.index[int(np.argmin(d))]
        datos = construir_variables(pd.DataFrame({"codigo": [codigo], "magnitud": [magnitud],
                                                  "profundidad_km": [profundidad_km], "epi_lat": [latitud],
                                                  "epi_lon": [longitud]}), ctx)
        x_df = datos[caracteristicas].astype(float)
        m = ctx.tabla.loc[codigo]
        extra = {"municipio": {"codigo": codigo, "nombre": m.nombre, "departamento": m.departamento,
                               "distanciaKm": round(float(d.min()), 1)},
                 "intensidadMmi": round(float(datos.mmi.iloc[0]), 2),
                 "distanciaHipocentralKm": round(float(datos.distancia_hipocentral_km.iloc[0]), 1)}
    else:
        x_df = pd.DataFrame([[magnitud, profundidad_km, latitud, longitud]], columns=CARACTERISTICAS)
    proba = _probabilidades(modelo, x_df.to_numpy(float))[0]
    probabilidades = {c: round(float(p), 4) for c, p in zip(CLASES, proba)}
    nivel = max(CLASES, key=lambda c: probabilidades[c])
    explicacion = None
    if "explicador" in paquete:  # type: ignore[operator]
        try:
            explicacion = explicar(paquete, x_df, nivel)  # type: ignore[arg-type]
        except Exception as error:
            log.warning("SHAP por predicción no disponible: %s", error)
    return {
        "nivelImpacto": nivel, "probabilidad": probabilidades[nivel], "probabilidades": probabilidades,
        "modelo": {"idModelo": fila.id_modelo, "version": fila.version, "algoritmo": fila.algoritmo},
        "explicacion": explicacion, **extra,
    }


def escenario(ajustes: Ajustes, resolvedor: ResolvedorMunicipios, magnitud: float, profundidad_km: float,
              latitud: float, longitud: float) -> dict[str, object]:
    """Intensidad y nivel de impacto en todos los municipios con MMI ≥ III a ≤ 300 km."""
    fila, paquete = _vigente(ajustes.database_url)
    modelo = paquete["modelo"]  # type: ignore[index]
    caracteristicas = paquete.get("caracteristicas", CARACTERISTICAS)  # type: ignore[union-attr]
    ctx = contexto(ajustes, resolvedor)
    t = ctx.tabla
    base = pd.DataFrame({"codigo": t.index, "magnitud": magnitud, "profundidad_km": profundidad_km,
                         "epi_lat": latitud, "epi_lon": longitud})
    datos = construir_variables(base, ctx)
    epicentral = haversine_km(latitud, longitud, datos.latitud.to_numpy(float), datos.longitud.to_numpy(float))
    datos = datos[(epicentral <= DISTANCIA_MAXIMA_KM) & (datos.mmi >= MMI_MINIMA_ESCENARIO)].copy()
    usa_distancia = "distancia_hipocentral_km" in caracteristicas or "mmi" in caracteristicas
    municipios = []
    if len(datos):
        proba = _probabilidades(modelo, datos[caracteristicas].to_numpy(float))
        for (_, d), p in zip(datos.iterrows(), proba):
            probabilidades = {c: round(float(v), 4) for c, v in zip(CLASES, p)}
            nivel = max(CLASES, key=lambda c: probabilidades[c])
            m = t.loc[d.codigo]
            municipios.append({
                "codigo": d.codigo, "municipio": m.nombre, "departamento": m.departamento,
                "latitud": float(m.latitud), "longitud": float(m.longitud),
                "distanciaHipocentralKm": round(float(d.distancia_hipocentral_km), 1),
                "intensidadMmi": round(float(d.mmi), 2), "nivelImpacto": nivel, "probabilidad": probabilidades[nivel],
                "probabilidades": probabilidades,
                "poblacion": None if "log_poblacion" not in d else int(round(10 ** float(d.log_poblacion))),
            })
    orden = {c: i for i, c in enumerate(reversed(CLASES))}
    municipios.sort(key=lambda m: (orden[m["nivelImpacto"]], -m["probabilidades"]["ALTO"], -m["intensidadMmi"]))
    return {
        "entrada": {"magnitud": magnitud, "profundidadKm": profundidad_km, "latitud": latitud, "longitud": longitud},
        "criterio": f"Municipios con MMI estimada ≥ {MMI_MINIMA_ESCENARIO:g} a ≤ {DISTANCIA_MAXIMA_KM:g} km del epicentro",
        "ecuacionIntensidad": "Allen, Wald y Worden (2012), distancia hipocentral",
        "modelo": {"idModelo": fila.id_modelo, "version": fila.version, "algoritmo": fila.algoritmo},
        "modeloUsaDistancia": usa_distancia,
        "municipios": municipios,
    }
