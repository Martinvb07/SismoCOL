"""Ingesta y limpieza de catálogos sísmicos (CSV/XLSX) — CRISP-DM fase 3.

Flujo: leer → mapear columnas → normalizar (fechas a UTC, números, territorio)
→ georreferenciar → enriquecer con USGS → marcar anomalías y duplicados →
zona e impacto → reporte. Los anómalos se marcan, nunca se borran. Las filas
sin fecha válida no se pueden guardar y cuentan como rechazadas.
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

from sismocol.geo import dentro_de_colombia, haversine_km
from sismocol.impacto import COLUMNAS_AFECTACION, ReglaNivel, nivel_impacto
from sismocol.municipios import ResolvedorMunicipios
from sismocol.territorio import clave, normalizar_departamento, zona_de

# ─── Parámetros de limpieza ─────────────────────────────────────────────────

DUPLICADO_SEGUNDOS = 5
DUPLICADO_KM = 5.0
DUPLICADO_DELTA_M = 0.1
MAGNITUD_MIN, MAGNITUD_MAX = -3.0, 10.0
PROFUNDIDAD_MAX_KM = 700.0
LARGO_ID_ORIGEN = 40
LARGO_MOTIVO = 120

FUENTES = ("SGC", "UNGRD", "DESINVENTAR", "USGS")
# Zona horaria de las fechas en cada fuente (verificado en el barrido, D3).
ZONA_HORARIA_POR_FUENTE = {
    "SGC": "UTC",
    "USGS": "UTC",
    "DESINVENTAR": "America/Bogota",
    "UNGRD": "America/Bogota",
}
# Fuentes que son reportes de daño por municipio (no catálogos instrumentales).
FUENTES_DANO = {"DESINVENTAR", "UNGRD"}
PAISES_VECINOS = ("ecuador", "peru", "venezuela", "panama", "brasil", "brazil")

# Columna canónica → nombres aceptados en el archivo (se comparan normalizados).
MAPEO_COLUMNAS: dict[str, list[str]] = {
    "id_evento": ["id_evento", "id", "event_id", "eventid", "codigo_evento"],
    "fecha": ["fecha", "fecha_hora", "fecha_utc", "fecha_evento", "time", "datetime", "date"],
    "hora": ["hora", "hora_utc", "hora_local"],
    "latitud": ["latitud", "lat", "latitude"],
    "longitud": ["longitud", "lon", "lng", "long", "longitude"],
    "profundidad_km": ["profundidad_km", "profundidad", "prof_km", "depth", "depth_km"],
    "magnitud": ["magnitud", "mag", "magnitude"],
    "tipo_magnitud": ["tipo_magnitud", "tipo_mag", "magtype", "mag_type"],
    "departamento": ["departamento", "depto", "dpto", "nombre_departamento"],
    "municipio": ["municipio", "mpio", "nom_mpio", "nombre_municipio"],
    "fuente": ["fuente_dataset", "fuente", "source", "catalogo"],
    "fallecidos": ["fallecidos", "muertos"],
    "heridos": ["heridos"],
    "desaparecidos": ["desaparecidos", "desapa"],
    "personas_afectadas": ["personas_afectadas", "afectados", "personas"],
    "damnificados": ["damnificados"],
    "viviendas_destruidas": ["viviendas_destruidas", "viv_destru"],
    "viviendas_averiadas": ["viviendas_averiadas", "viviendas_afectadas", "viv_aver"],
}
COLUMNAS_OBLIGATORIAS = ("fecha", "magnitud", "profundidad_km")
HOJA_PREFERIDA = "Datos"


class ErrorIngesta(ValueError):
    """Archivo que no se puede procesar (formato, columnas faltantes)."""


# ─── Lectura y mapeo ────────────────────────────────────────────────────────

def leer_archivo(contenido: bytes, nombre: str) -> pd.DataFrame:
    extension = Path(nombre).suffix.lower()
    try:
        if extension in (".xlsx", ".xlsm"):
            libro = pd.ExcelFile(io.BytesIO(contenido), engine="openpyxl")
            hoja = HOJA_PREFERIDA if HOJA_PREFERIDA in libro.sheet_names else libro.sheet_names[0]
            return libro.parse(hoja)
        if extension == ".csv":
            for codificacion in ("utf-8-sig", "latin-1"):
                try:
                    return pd.read_csv(io.BytesIO(contenido), sep=None, engine="python",
                                       encoding=codificacion)
                except UnicodeDecodeError:
                    continue
    except Exception as error:  # el detalle del parser no le sirve al usuario
        raise ErrorIngesta(f"No se pudo leer el archivo: {error}") from error
    raise ErrorIngesta(f"Formato no soportado: '{extension}'. Use CSV o XLSX.")


def mapear_columnas(columnas: list[str]) -> dict[str, str]:
    """Columna canónica → nombre original en el archivo."""
    por_clave = {clave(c): c for c in columnas}
    mapeo: dict[str, str] = {}
    for canonica, alias in MAPEO_COLUMNAS.items():
        for nombre in alias:
            original = por_clave.get(clave(nombre))
            if original is not None:
                mapeo[canonica] = original
                break
    return mapeo


def validar_mapeo(mapeo: dict[str, str], fuente_por_defecto: str | None) -> None:
    faltantes = [c for c in COLUMNAS_OBLIGATORIAS if c not in mapeo]
    tiene_coordenadas = "latitud" in mapeo and "longitud" in mapeo
    if not tiene_coordenadas and "municipio" not in mapeo:
        faltantes.append("latitud y longitud (o municipio)")
    if "fuente" not in mapeo and fuente_por_defecto is None:
        faltantes.append("fuente (columna o parámetro)")
    if faltantes:
        raise ErrorIngesta("Faltan columnas obligatorias: " + ", ".join(faltantes))


# ─── Normalización ──────────────────────────────────────────────────────────

def normalizar_fuente(valor: object) -> str | None:
    k = clave(str(valor)) if isinstance(valor, str) else ""
    for fuente in FUENTES:
        if fuente.lower() in k.replace(" ", ""):
            return fuente
    return None


def _a_numero(serie: pd.Series) -> pd.Series:
    if serie.dtype == object:
        serie = serie.astype(str).str.strip().str.replace(",", ".", regex=False)
    return pd.to_numeric(serie, errors="coerce")


def _conteo(serie: pd.Series) -> pd.Series:
    """Conteos de personas/viviendas. Un valor como 1.197 en una columna de
    conteo es un separador de miles mal leído (1197); otros decimales se redondean."""
    valores = _a_numero(serie)
    fraccion = (valores % 1).abs() > 1e-9
    miles = fraccion & ((valores * 1000 - (valores * 1000).round()).abs() < 1e-6)
    valores = valores.where(~miles, valores * 1000)
    return valores.round().where(valores >= 0)


_FECHA_DIA_PRIMERO = r"^\s*\d{1,2}[/-]\d{1,2}[/-]\d{4}"


def _parsear_fechas(valores: pd.Series) -> pd.Series:
    """Fechas en formatos mezclados: ISO (2024-03-01) o colombiano día/mes/año."""
    if pd.api.types.is_datetime64_any_dtype(valores):
        return valores
    texto = valores.astype(str).str.strip()
    dia_primero = texto.str.match(_FECHA_DIA_PRIMERO)
    resultado = pd.to_datetime(texto.where(~dia_primero), errors="coerce", format="mixed")
    if dia_primero.any():
        resultado[dia_primero] = pd.to_datetime(texto[dia_primero], errors="coerce",
                                                format="mixed", dayfirst=True)
    return resultado


def _fecha_utc(fechas: pd.Series, horas: pd.Series | None, zonas: pd.Series) -> pd.Series:
    """Combina fecha (+ hora) y convierte a UTC ingenuo según la zona de cada fila."""
    if horas is not None:
        solo_fecha = _parsear_fechas(fechas).dt.strftime("%Y-%m-%d")
        fechas = pd.to_datetime(solo_fecha + " " + horas.astype(str).str.strip(),
                                errors="coerce", format="mixed")
    else:
        fechas = _parsear_fechas(fechas)
    if getattr(fechas.dt, "tz", None) is not None:
        return fechas.dt.tz_convert("UTC").dt.tz_localize(None)
    resultado = pd.Series(pd.NaT, index=fechas.index, dtype="datetime64[ns]")
    for zona in zonas.dropna().unique():
        filas = zonas == zona
        resultado[filas] = (
            fechas[filas].dt.tz_localize(zona, ambiguous="NaT", nonexistent="NaT")
            .dt.tz_convert("UTC").dt.tz_localize(None)
        )
    return resultado


def normalizar(crudo: pd.DataFrame, mapeo: dict[str, str], fuente_por_defecto: str | None,
               zona_horaria: str | None) -> pd.DataFrame:
    col = lambda nombre: crudo[mapeo[nombre]] if nombre in mapeo else None  # noqa: E731
    df = pd.DataFrame(index=crudo.index)

    fuente = col("fuente")
    df["fuente"] = fuente.map(normalizar_fuente) if fuente is not None else None
    if fuente_por_defecto is not None:
        df["fuente"] = df["fuente"].fillna(fuente_por_defecto)

    zonas = (pd.Series(zona_horaria, index=crudo.index) if zona_horaria
             else df["fuente"].map(ZONA_HORARIA_POR_FUENTE))
    df["fecha_hora"] = _fecha_utc(col("fecha"), col("hora"), zonas)

    for nombre in ("latitud", "longitud", "profundidad_km", "magnitud"):
        serie = col(nombre)
        df[nombre] = _a_numero(serie) if serie is not None else np.nan
    for nombre in COLUMNAS_AFECTACION:
        serie = col(nombre)
        df[nombre] = _conteo(serie) if serie is not None else np.nan
    df["magnitud"] = df["magnitud"].round(1)
    df["profundidad_km"] = df["profundidad_km"].round(2)

    tipo = col("tipo_magnitud")
    df["tipo_magnitud"] = tipo.astype(str).str.strip().str.slice(0, 8) if tipo is not None else None
    depto_original = col("departamento")
    df["departamento_original"] = depto_original if depto_original is not None else None
    df["departamento"] = (depto_original.map(normalizar_departamento)
                          if depto_original is not None else None)
    municipio = col("municipio")
    df["municipio_original"] = municipio if municipio is not None else None

    ident = col("id_evento")
    df["id_evento_origen"] = (ident.astype(str).str.strip().str.slice(0, LARGO_ID_ORIGEN)
                              if ident is not None else None)
    return df


# ─── Georreferenciación ─────────────────────────────────────────────────────

def georreferenciar(df: pd.DataFrame, resolvedor: ResolvedorMunicipios) -> pd.DataFrame:
    """Coordenadas del archivo si existen; si no, centroide del municipio DIVIPOLA.
    El municipio y el departamento quedan con su nombre oficial."""
    df = df.copy()
    tiene_coord = df.latitud.notna() & df.longitud.notna()
    df["precision_ubicacion"] = np.where(tiene_coord, "EPICENTRO", None)
    df["municipio"] = None
    df["codigo_municipio"] = None

    for i in df.index:
        ref = resolvedor.resolver(df.at[i, "departamento"], df.at[i, "municipio_original"])
        if ref is None and tiene_coord[i]:
            cercano = resolvedor.mas_cercano(df.at[i, "latitud"], df.at[i, "longitud"])
            ref = cercano[0] if cercano else None
        if ref is None:
            continue
        df.at[i, "municipio"] = ref.nombre
        df.at[i, "codigo_municipio"] = ref.codigo
        df.at[i, "departamento"] = ref.departamento
        if not tiene_coord[i]:
            df.at[i, "latitud"] = ref.latitud
            df.at[i, "longitud"] = ref.longitud
            df.at[i, "precision_ubicacion"] = "CENTROIDE_MUNICIPIO"
    return df


def enriquecer_con_usgs(df: pd.DataFrame, usgs: pd.DataFrame, tolerancia_s: int = 30,
                        delta_m: float = 0.5, max_km: float = 150.0) -> pd.DataFrame:
    """Reemplaza el centroide por el epicentro USGS cuando hay un evento equivalente.
    Se conservan magnitud y profundidad de la fuente original (consistencia del catálogo).
    `usgs` necesita columnas time (UTC ingenuo), latitude, longitude, mag."""
    df = df.copy()
    if usgs.empty:
        df["id_usgs"] = None
        return df
    u = usgs.sort_values("time").reset_index(drop=True)
    t_u = u.time.to_numpy().astype("datetime64[s]").astype(np.int64)
    candidatos = df.index[(df.precision_ubicacion == "CENTROIDE_MUNICIPIO")
                          & df.fecha_hora.notna() & df.magnitud.notna()]
    t = df.loc[candidatos, "fecha_hora"].to_numpy().astype("datetime64[s]").astype(np.int64)
    j = np.clip(np.searchsorted(t_u, t), 1, len(t_u) - 1)
    j = np.where(np.abs(t_u[j - 1] - t) < np.abs(t_u[j] - t), j - 1, j)
    pareja = u.iloc[j].set_index(candidatos)
    ok = (
        (np.abs(t_u[j] - t) <= tolerancia_s)
        & (np.abs(pareja.mag.to_numpy() - df.loc[candidatos, "magnitud"].to_numpy()) <= delta_m)
        & (haversine_km(df.loc[candidatos, "latitud"].to_numpy(dtype=float),
                        df.loc[candidatos, "longitud"].to_numpy(dtype=float),
                        pareja.latitude.to_numpy(), pareja.longitude.to_numpy()) <= max_km)
    )
    filas = candidatos[ok]
    df["id_usgs"] = None
    df.loc[filas, "latitud"] = pareja.loc[filas, "latitude"]
    df.loc[filas, "longitud"] = pareja.loc[filas, "longitude"]
    df.loc[filas, "precision_ubicacion"] = "EPICENTRO"
    df.loc[filas, "id_usgs"] = pareja.loc[filas, "id"] if "id" in pareja else None
    return df


# ─── Anomalías y duplicados ─────────────────────────────────────────────────

def _agregar_motivo(motivos: pd.Series, mascara: pd.Series, texto: str) -> None:
    motivos[mascara] = motivos[mascara].map(lambda m: f"{m}; {texto}" if m else texto)


def marcar_anomalias(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    motivos = pd.Series("", index=df.index, dtype=object)
    original = df.departamento_original.fillna("").astype(str).map(clave)
    extranjero = original.map(lambda k: any(p in k for p in PAISES_VECINOS))
    no_reconocido = df.departamento.isna() & (original != "") & ~extranjero

    _agregar_motivo(motivos, df.magnitud.isna(), "magnitud nula")
    _agregar_motivo(motivos, (df.magnitud < MAGNITUD_MIN) | (df.magnitud > MAGNITUD_MAX),
                    "magnitud fuera de rango")
    _agregar_motivo(motivos, df.profundidad_km.isna(), "profundidad nula")
    _agregar_motivo(motivos, df.profundidad_km < 0, "profundidad negativa")
    _agregar_motivo(motivos, df.profundidad_km > PROFUNDIDAD_MAX_KM, "profundidad fuera de rango")
    con_coord = df.latitud.notna() & df.longitud.notna()
    fuera_bbox = con_coord & ~dentro_de_colombia(df.latitud.fillna(0).to_numpy(),
                                                 df.longitud.fillna(0).to_numpy())
    _agregar_motivo(motivos, extranjero | fuera_bbox, "fuera de Colombia")
    _agregar_motivo(motivos, no_reconocido, "departamento no reconocido")
    _agregar_motivo(motivos, ~con_coord & ~extranjero, "sin ubicación")
    df["motivo_anomalia"] = motivos
    return df


def marcar_duplicados(df: pd.DataFrame) -> pd.DataFrame:
    """Duplicado: misma fuente, ±5 s, < 5 km y |ΔM| ≤ 0,1 respecto a un registro
    anterior. En reportes de daño además debe coincidir el municipio (cada fila
    es el impacto en un municipio distinto). Se marca el registro posterior."""
    df = df.copy()
    duplicado = pd.Series(False, index=df.index)
    aptos = df[df.fecha_hora.notna() & df.magnitud.notna() & df.latitud.notna()]
    for fuente, grupo in aptos.groupby("fuente"):
        g = grupo.sort_values("fecha_hora")
        t = g.fecha_hora.to_numpy().astype("datetime64[ms]").astype(np.int64)
        lat, lon = g.latitud.to_numpy(float), g.longitud.to_numpy(float)
        mag = g.magnitud.to_numpy(float)
        mpio = g.municipio.to_numpy(object)
        idx = g.index.to_numpy()
        desplazamiento = 1
        while desplazamiento < len(g):
            a, b = slice(0, len(g) - desplazamiento), slice(desplazamiento, None)
            cerca_t = (t[b] - t[a]) <= DUPLICADO_SEGUNDOS * 1000
            if not cerca_t.any():
                break
            criterio = (
                cerca_t
                & (np.abs(mag[b] - mag[a]) <= DUPLICADO_DELTA_M + 1e-9)
                & (haversine_km(lat[a], lon[a], lat[b], lon[b]) < DUPLICADO_KM)
            )
            if fuente in FUENTES_DANO:
                criterio &= mpio[a] == mpio[b]
            duplicado[idx[b][criterio]] = True
            desplazamiento += 1
    motivos = df.motivo_anomalia.copy()
    _agregar_motivo(motivos, duplicado, "duplicado")
    df["motivo_anomalia"] = motivos
    return df


# ─── Claves, zona y reporte ─────────────────────────────────────────────────

def _sha256(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def asignar_claves(df: pd.DataFrame) -> pd.DataFrame:
    """id_evento_origen (si el archivo no trae, se deriva) y clave_origen única
    por fuente|id|municipio. Repeticiones exactas dentro del archivo se marcan."""
    df = df.copy()
    # UNGRD no publica ID de evento (la columna trae el código DIVIPOLA): fecha + municipio.
    ungrd = df.fuente == "UNGRD"
    df.loc[ungrd, "id_evento_origen"] = (
        df.loc[ungrd, "fecha_hora"].dt.strftime("%Y%m%d") + "-"
        + df.loc[ungrd, "codigo_municipio"].fillna(df.loc[ungrd, "id_evento_origen"]).astype(str)
    )
    sin_id = df.id_evento_origen.isna() | (df.id_evento_origen.astype(str).str.strip() == "")
    derivado = (df.fecha_hora.astype(str) + "|" + df.magnitud.astype(str) + "|"
                + df.latitud.astype(str) + "|" + df.longitud.astype(str))
    df.loc[sin_id, "id_evento_origen"] = derivado[sin_id].map(lambda s: _sha256(s)[:LARGO_ID_ORIGEN])
    municipio = df.municipio.fillna(df.municipio_original).fillna("").astype(str).map(clave)
    df["clave_origen"] = (df.fuente.astype(str) + "|" + df.id_evento_origen.astype(str)
                          + "|" + municipio).map(_sha256)
    repetido = df.clave_origen.duplicated(keep="first")
    motivos = df.motivo_anomalia.copy()
    _agregar_motivo(motivos, repetido, "repetido en el archivo")
    df["motivo_anomalia"] = motivos
    return df


def finalizar(df: pd.DataFrame, reglas: list[ReglaNivel]) -> pd.DataFrame:
    df = df.copy()
    df["zona"] = [zona_de(d, p if pd.notna(p) else None)
                  for d, p in zip(df.departamento, df.profundidad_km)]
    df["nivel_impacto"] = nivel_impacto(df, reglas)
    df["es_anomalo"] = df.motivo_anomalia != ""
    df["motivo_anomalia"] = df.motivo_anomalia.str.slice(0, LARGO_MOTIVO).replace("", None)
    return df


@dataclass
class ReporteFuente:
    fuente: str
    leidos: int
    validos: int
    por_motivo: dict[str, int]
    con_epicentro: int
    con_centroide: int
    con_afectacion: int


@dataclass
class ResultadoIngesta:
    nombre_archivo: str
    mapeo: dict[str, str]
    columnas_ignoradas: list[str]
    leidos: int
    rechazados_sin_fecha: int
    sin_fuente: int
    por_fuente: list[ReporteFuente] = field(default_factory=list)
    datos: pd.DataFrame | None = None

    @property
    def validos(self) -> int:
        return sum(r.validos for r in self.por_fuente)

    def resumen(self) -> dict[str, object]:
        return {
            "nombre_archivo": self.nombre_archivo,
            "mapeo": self.mapeo,
            "columnas_ignoradas": self.columnas_ignoradas,
            "leidos": self.leidos,
            "validos": self.validos,
            "rechazados_sin_fecha": self.rechazados_sin_fecha,
            "sin_fuente": self.sin_fuente,
            "por_fuente": [r.__dict__ for r in self.por_fuente],
        }


def _contar_motivos(motivos: pd.Series) -> dict[str, int]:
    return (motivos.dropna().str.split("; ").explode().value_counts().astype(int).to_dict())


def procesar(crudo: pd.DataFrame, nombre_archivo: str, resolvedor: ResolvedorMunicipios,
             reglas: list[ReglaNivel], *, fuente_por_defecto: str | None = None,
             zona_horaria: str | None = None,
             obtener_usgs: Callable[[pd.Timestamp, pd.Timestamp], pd.DataFrame] | None = None,
             ) -> ResultadoIngesta:
    if fuente_por_defecto is not None and fuente_por_defecto not in FUENTES:
        raise ErrorIngesta(f"Fuente no válida: {fuente_por_defecto}")
    mapeo = mapear_columnas([str(c) for c in crudo.columns])
    validar_mapeo(mapeo, fuente_por_defecto)
    ignoradas = [str(c) for c in crudo.columns if c not in mapeo.values()]

    df = normalizar(crudo, mapeo, fuente_por_defecto, zona_horaria)
    sin_fecha = int(df.fecha_hora.isna().sum())
    sin_fuente = int(df.fuente.isna().sum())
    df = df[df.fecha_hora.notna() & df.fuente.notna()]

    df = georreferenciar(df, resolvedor)
    if obtener_usgs is not None and len(df):
        df = enriquecer_con_usgs(df, obtener_usgs(df.fecha_hora.min(), df.fecha_hora.max()))
    else:
        df["id_usgs"] = None
    df = marcar_anomalias(df)
    df = marcar_duplicados(df)
    df = asignar_claves(df)
    df = finalizar(df, reglas)

    reportes = []
    for fuente, g in df.groupby("fuente"):
        reportes.append(ReporteFuente(
            fuente=str(fuente),
            leidos=len(g),
            validos=int((~g.es_anomalo).sum()),
            por_motivo=_contar_motivos(g.motivo_anomalia),
            con_epicentro=int((g.precision_ubicacion == "EPICENTRO").sum()),
            con_centroide=int((g.precision_ubicacion == "CENTROIDE_MUNICIPIO").sum()),
            con_afectacion=int(g[COLUMNAS_AFECTACION].notna().any(axis=1).sum()),
        ))
    return ResultadoIngesta(nombre_archivo, mapeo, ignoradas, len(crudo), sin_fecha,
                            sin_fuente, reportes, df)
