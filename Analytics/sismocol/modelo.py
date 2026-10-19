"""Modelo de nivel de impacto (fase 5, CRISP-DM: modelado y evaluación).

Ejemplos de entrenamiento (decisión D7):
- reportes de daño de DesInventar y UNGRD con magnitud, profundidad y ubicación,
  etiquetados con `nivel_impacto` (Analytics/config/umbrales_impacto.json);
- una muestra de sismos SGC con M ≥ 3,5 sin reporte de daño en su municipio
  y fecha (±1 día), etiquetados SIN_AFECTACION.

Se comparan árbol de decisión, Random Forest y regresión logística multinomial
(todos con class_weight="balanced") por F1 macro en validación cruzada
estratificada, contra un baseline de clase mayoritaria. El mejor se evalúa en
un conjunto de prueba apartado y se reentrena con todos los datos.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier
from sqlalchemy import func, insert, select

from sismocol import db
from sismocol.config import RAIZ_ANALYTICS

log = logging.getLogger("sismocol.modelo")

CLASES = ["SIN_AFECTACION", "BAJO", "MODERADO", "ALTO"]
CARACTERISTICAS = ["magnitud", "profundidad_km", "latitud", "longitud"]
DIR_MODELOS = RAIZ_ANALYTICS / "models"
SEMILLA = 42
FRACCION_PRUEBA = 0.25
MAX_PLIEGUES = 5
MIN_EJEMPLOS = 30
MIN_POR_CLASE = 4
MAGNITUD_MIN_SIN_AFECTACION = 3.5
PROPORCION_SIN_AFECTACION = 2  # sismos SIN_AFECTACION por cada reporte de daño
DIAS_ASOCIACION = 1
BASELINE = "Baseline (clase mayoritaria)"


class DatosInsuficientes(LookupError):
    pass


class SinModeloActivo(LookupError):
    pass


def candidatos() -> dict[str, object]:
    return {
        "Árbol de decisión": DecisionTreeClassifier(max_depth=6, min_samples_leaf=3, class_weight="balanced",
                                                    random_state=SEMILLA),
        "Random Forest": RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced",
                                                random_state=SEMILLA, n_jobs=-1),
        "Regresión logística multinomial": make_pipeline(
            StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=3000)),
    }


# ─── Datos ──────────────────────────────────────────────────────────────────

def ejemplos(url: str) -> pd.DataFrame:
    """Tabla de entrenamiento: características + `nivel`."""
    t = db.tablas(url)["registro_sismico"]
    columnas = [t.c.fecha_hora, t.c.municipio, t.c.departamento, *(t.c[c] for c in CARACTERISTICAS)]
    completos = [t.c[c].is_not(None) for c in CARACTERISTICAS]
    with db.motor(url).connect() as c:
        reportes = pd.DataFrame(c.execute(
            select(*columnas, t.c.nivel_impacto.label("nivel"))
            .where(t.c.fuente.in_(["DESINVENTAR", "UNGRD"]), t.c.es_anomalo.is_(False),
                   t.c.nivel_impacto.is_not(None), *completos)
        ).all())
        sgc = pd.DataFrame(c.execute(
            select(*columnas)
            .where(t.c.fuente == "SGC", t.c.es_anomalo.is_(False),
                   t.c.magnitud >= MAGNITUD_MIN_SIN_AFECTACION, *completos)
        ).all())
    if reportes.empty:
        raise DatosInsuficientes("No hay reportes de daño (DesInventar/UNGRD) con magnitud, profundidad y ubicación. "
                                 "Cargue el Excel completo o sincronice con la UNGRD.")
    sin_reporte = _sin_reporte(sgc, reportes) if not sgc.empty else sgc
    cupo = PROPORCION_SIN_AFECTACION * int((reportes.nivel != "SIN_AFECTACION").sum())
    if len(sin_reporte) > cupo > 0:
        sin_reporte = sin_reporte.sample(n=cupo, random_state=SEMILLA)
    sin_reporte = sin_reporte.assign(nivel="SIN_AFECTACION")
    datos = pd.concat([reportes, sin_reporte], ignore_index=True)
    for columna in CARACTERISTICAS:
        datos[columna] = pd.to_numeric(datos[columna]).astype(float)
    return datos[[*CARACTERISTICAS, "nivel"]]


def _sin_reporte(sgc: pd.DataFrame, reportes: pd.DataFrame) -> pd.DataFrame:
    """Sismos SGC sin reporte de daño en su municipio a ±1 día (D7)."""
    clave = lambda df: df.departamento.fillna("") + "|" + df.municipio.fillna("")  # noqa: E731
    dias_reporte: dict[str, list[pd.Timestamp]] = {}
    for k, fecha in zip(clave(reportes), pd.to_datetime(reportes.fecha_hora)):
        dias_reporte.setdefault(k, []).append(fecha)
    ventana = timedelta(days=DIAS_ASOCIACION + 1)
    conserva = [
        not any(abs(fecha - f) <= ventana for f in dias_reporte.get(k, ()))
        for k, fecha in zip(clave(sgc), pd.to_datetime(sgc.fecha_hora))
    ]
    return sgc[conserva]


# ─── Entrenamiento ──────────────────────────────────────────────────────────

@dataclass
class ResultadoEntrenamiento:
    algoritmo: str
    modelo: object
    exactitud: float
    f1_macro: float
    reporte: dict[str, object]


def entrenar_y_evaluar(datos: pd.DataFrame) -> ResultadoEntrenamiento:
    """Selección por CV estratificada, evaluación en prueba y reentrenamiento con todo."""
    conteo = datos.nivel.value_counts()
    presentes = [c for c in CLASES if conteo.get(c, 0) >= MIN_POR_CLASE]
    datos = datos[datos.nivel.isin(presentes)]
    if len(datos) < MIN_EJEMPLOS or len(presentes) < 2:
        raise DatosInsuficientes(
            f"Se necesitan al menos {MIN_EJEMPLOS} ejemplos y 2 niveles con {MIN_POR_CLASE}+ casos "
            f"(hay {len(datos)}: {conteo.to_dict()}).")

    x, y = datos[CARACTERISTICAS].to_numpy(), datos.nivel.to_numpy()
    x_ent, x_pru, y_ent, y_pru = train_test_split(x, y, test_size=FRACCION_PRUEBA, stratify=y, random_state=SEMILLA)
    pliegues = StratifiedKFold(n_splits=min(MAX_PLIEGUES, int(pd.Series(y_ent).value_counts().min())),
                               shuffle=True, random_state=SEMILLA)

    comparacion = []
    for nombre, estimador in candidatos().items():
        f1 = cross_val_score(estimador, x_ent, y_ent, cv=pliegues, scoring="f1_macro").mean()
        comparacion.append({"algoritmo": nombre, "f1Macro": round(float(f1), 4)})
    baseline = DummyClassifier(strategy="most_frequent").fit(x_ent, y_ent)
    f1_baseline = f1_score(y_pru, baseline.predict(x_pru), average="macro", labels=presentes, zero_division=0)
    comparacion.append({"algoritmo": BASELINE, "f1Macro": round(float(f1_baseline), 4)})

    mejor = max((c for c in comparacion if c["algoritmo"] != BASELINE), key=lambda c: c["f1Macro"])["algoritmo"]
    evaluado = clone(candidatos()[mejor]).fit(x_ent, y_ent)
    predicho = evaluado.predict(x_pru)
    precision, recall, f1, soporte = precision_recall_fscore_support(y_pru, predicho, labels=CLASES, zero_division=0)
    reporte = {
        "clases": CLASES,
        "matrizConfusion": confusion_matrix(y_pru, predicho, labels=CLASES).tolist(),
        "porClase": {
            c: {"precision": round(float(precision[i]), 4), "recall": round(float(recall[i]), 4),
                "f1": round(float(f1[i]), 4), "soporte": int(soporte[i])}
            for i, c in enumerate(CLASES)
        },
        "comparacion": comparacion,
    }
    final = clone(candidatos()[mejor]).fit(x, y)
    return ResultadoEntrenamiento(
        algoritmo=mejor,
        modelo=final,
        exactitud=float(accuracy_score(y_pru, predicho)),
        f1_macro=float(f1_score(y_pru, predicho, average="macro", labels=presentes, zero_division=0)),
        reporte=reporte,
    )


_entrenando = threading.Lock()


def _fila_modelo(fila) -> dict[str, object]:
    return {
        "idModelo": fila.id_modelo, "version": fila.version, "algoritmo": fila.algoritmo,
        "exactitud": float(fila.exactitud), "f1Macro": float(fila.f1_macro), "activo": bool(fila.activo),
        "fechaEntrenamiento": pd.Timestamp(fila.fecha_entrenamiento).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }


def entrenar(url: str) -> dict[str, object]:
    """Entrena, guarda el archivo y registra el modelo. Si no hay uno activo, lo activa."""
    if not _entrenando.acquire(blocking=False):
        raise DatosInsuficientes("Ya hay un entrenamiento en curso. Espere a que termine.")
    try:
        resultado = entrenar_y_evaluar(ejemplos(url))
        t = db.tablas(url)["modelo_predictivo"]
        with db.motor(url).begin() as c:
            n = c.execute(select(func.count()).select_from(t)).scalar_one()
            version = f"v1.{n}.0"
            hay_activo = c.execute(select(func.count()).select_from(t).where(t.c.activo.is_(True))).scalar_one() > 0
            DIR_MODELOS.mkdir(parents=True, exist_ok=True)
            archivo = DIR_MODELOS / f"impacto_{version}.joblib"
            joblib.dump({"modelo": resultado.modelo, "caracteristicas": CARACTERISTICAS}, archivo)
            id_modelo = c.execute(insert(t).values(
                version=version, algoritmo=resultado.algoritmo,
                ruta_archivo=str(archivo.relative_to(RAIZ_ANALYTICS)),
                exactitud=round(resultado.exactitud, 4), f1_macro=round(resultado.f1_macro, 4),
                activo=not hay_activo,
                fecha_entrenamiento=datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0),
            )).inserted_primary_key[0]
            fila = c.execute(select(t).where(t.c.id_modelo == id_modelo)).one()
        log.info("Modelo %s entrenado: %s, F1 macro %.3f", version, resultado.algoritmo, resultado.f1_macro)
        return {"modelo": _fila_modelo(fila), "reporte": resultado.reporte}
    finally:
        _entrenando.release()


# ─── Predicción ─────────────────────────────────────────────────────────────

_cargados: dict[str, object] = {}


def predecir(url: str, magnitud: float, profundidad_km: float, latitud: float, longitud: float) -> dict[str, object]:
    t = db.tablas(url)["modelo_predictivo"]
    with db.motor(url).connect() as c:
        fila = c.execute(select(t).where(t.c.activo.is_(True)).limit(1)).first()
    if fila is None:
        raise SinModeloActivo("No hay un modelo de impacto activo. Entrénelo en Administración → Datos y modelo.")
    ruta = RAIZ_ANALYTICS / fila.ruta_archivo
    if fila.ruta_archivo not in _cargados:
        if not ruta.exists():
            raise SinModeloActivo(f"No se encuentra el archivo del modelo {fila.version}. Vuelva a entrenarlo.")
        _cargados[fila.ruta_archivo] = joblib.load(ruta)
    paquete = _cargados[fila.ruta_archivo]
    modelo = paquete["modelo"]  # type: ignore[index]
    x = np.array([[magnitud, profundidad_km, latitud, longitud]], dtype=float)
    probabilidades = dict.fromkeys(CLASES, 0.0)
    for clase, p in zip(modelo.classes_, modelo.predict_proba(x)[0]):
        probabilidades[str(clase)] = round(float(p), 4)
    nivel = max(CLASES, key=lambda c: probabilidades[c])
    return {
        "nivelImpacto": nivel,
        "probabilidad": probabilidades[nivel],
        "probabilidades": probabilidades,
        "modelo": {"idModelo": fila.id_modelo, "version": fila.version, "algoritmo": fila.algoritmo},
    }

