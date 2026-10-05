"""Acceso a MySQL con SQLAlchemy Core.

El esquema lo define y migra Prisma (Backend/prisma); aquí las tablas se
reflejan de la base para no duplicar la definición.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache

import numpy as np
import pandas as pd
from sqlalchemy import Engine, MetaData, Table, create_engine, func, insert, select

from sismocol.impacto import COLUMNAS_AFECTACION
from sismocol.ingest import ResultadoIngesta

TABLAS = ("carga_datos", "registro_sismico", "afectacion", "usuario")
COLUMNAS_REGISTRO = [
    "id_evento_origen", "clave_origen", "fecha_hora", "latitud", "longitud",
    "precision_ubicacion", "profundidad_km", "magnitud", "tipo_magnitud", "departamento",
    "municipio", "zona", "fuente", "nivel_impacto", "es_anomalo", "motivo_anomalia",
]


@lru_cache
def motor(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True, pool_recycle=1800, future=True)


@lru_cache
def tablas(url: str) -> dict[str, Table]:
    metadata = MetaData()
    metadata.reflect(bind=motor(url), only=TABLAS)
    return {nombre: metadata.tables[nombre] for nombre in TABLAS}


def _limpio(valor: object) -> object:
    """NaN/NaT → None y tipos de NumPy → tipos de Python, para el driver."""
    if valor is None or (isinstance(valor, float) and np.isnan(valor)) or valor is pd.NaT:
        return None
    if isinstance(valor, np.generic):
        return valor.item()
    if isinstance(valor, pd.Timestamp):
        return valor.to_pydatetime()
    return valor


def _registros(df: pd.DataFrame, columnas: list[str]) -> list[dict[str, object]]:
    return [{c: _limpio(v) for c, v in zip(columnas, fila)}
            for fila in df[columnas].itertuples(index=False, name=None)]


@dataclass
class CargaGuardada:
    id_carga: int
    fuente: str
    nuevos: int
    existentes: int


def registrar_rechazo(url: str, nombre_archivo: str, fuente: str, id_usuario: int | None,
                      origen: str, leidos: int) -> int:
    t = tablas(url)["carga_datos"]
    with motor(url).begin() as conexion:
        resultado = conexion.execute(insert(t).values(
            id_usuario=id_usuario, origen=origen, fuente=fuente, nombre_archivo=nombre_archivo[:255],
            registros_leidos=leidos, registros_validos=0, estado="RECHAZADO",
            fecha_carga=datetime.now(timezone.utc).replace(tzinfo=None),
        ))
        return int(resultado.inserted_primary_key[0])


def guardar_ingesta(url: str, resultado: ResultadoIngesta, id_usuario: int | None, origen: str,
                    tamano_lote: int) -> list[CargaGuardada]:
    """Una carga_datos por fuente presente en el archivo. Las recargas son
    idempotentes: los registros con una clave_origen ya existente se ignoran."""
    assert resultado.datos is not None
    t = tablas(url)
    guardadas: list[CargaGuardada] = []
    for reporte in resultado.por_fuente:
        df = resultado.datos[resultado.datos.fuente == reporte.fuente]
        with motor(url).begin() as conexion:
            id_carga = int(conexion.execute(insert(t["carga_datos"]).values(
                id_usuario=id_usuario, origen=origen, fuente=reporte.fuente,
                nombre_archivo=resultado.nombre_archivo[:255],
                registros_leidos=reporte.leidos, registros_validos=reporte.validos,
                estado="PROCESADO", fecha_carga=datetime.now(timezone.utc).replace(tzinfo=None),
            )).inserted_primary_key[0])

            filas = _registros(df, COLUMNAS_REGISTRO)
            nuevos = 0
            for inicio in range(0, len(filas), tamano_lote):
                lote = [{**f, "id_carga": id_carga} for f in filas[inicio:inicio + tamano_lote]]
                nuevos += conexion.execute(
                    insert(t["registro_sismico"]).prefix_with("IGNORE"), lote).rowcount

            con_afectacion = df[df[COLUMNAS_AFECTACION].notna().any(axis=1)]
            if len(con_afectacion):
                ids = dict(conexion.execute(
                    select(t["registro_sismico"].c.clave_origen, t["registro_sismico"].c.id_sismo)
                    .where(t["registro_sismico"].c.clave_origen.in_(con_afectacion.clave_origen.tolist()))
                ).all())
                afectaciones = [
                    {**fila, "id_sismo": ids[clave], "fuente": reporte.fuente}
                    for clave, fila in zip(con_afectacion.clave_origen,
                                           _registros(con_afectacion, COLUMNAS_AFECTACION))
                    if clave in ids
                ]
                for inicio in range(0, len(afectaciones), tamano_lote):
                    conexion.execute(insert(t["afectacion"]).prefix_with("IGNORE"),
                                     afectaciones[inicio:inicio + tamano_lote])
        guardadas.append(CargaGuardada(id_carga, reporte.fuente, nuevos, len(filas) - nuevos))
    return guardadas


def ultima_fecha(url: str, fuente: str) -> datetime | None:
    t = tablas(url)["registro_sismico"]
    with motor(url).connect() as conexion:
        return conexion.execute(select(func.max(t.c.fecha_hora)).where(t.c.fuente == fuente)).scalar()


def eventos_entre(url: str, inicio: datetime, fin: datetime, magnitud_min: float) -> pd.DataFrame:
    """Eventos instrumentales válidos (SGC/USGS) en un rango, para asociar reportes de daño."""
    t = tablas(url)["registro_sismico"]
    consulta = (
        select(t.c.fecha_hora, t.c.latitud, t.c.longitud, t.c.magnitud, t.c.profundidad_km)
        .where(t.c.fuente.in_(["SGC", "USGS"]), t.c.es_anomalo.is_(False),
               t.c.fecha_hora.between(inicio, fin), t.c.magnitud >= magnitud_min)
    )
    with motor(url).connect() as conexion:
        df = pd.DataFrame(conexion.execute(consulta).all(),
                          columns=["fecha_hora", "latitud", "longitud", "magnitud", "profundidad_km"])
    for columna in ("latitud", "longitud", "magnitud", "profundidad_km"):
        df[columna] = pd.to_numeric(df[columna])
    return df


def ping(url: str) -> None:
    with motor(url).connect() as conexion:
        conexion.execute(select(1))
