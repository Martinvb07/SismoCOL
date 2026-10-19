"""Servicio analítico interno de SismoCol (FastAPI).

Solo lo llama la API de Node, con el token compartido en la cabecera
`X-Token-Interno`. Escucha en 127.0.0.1; no se expone a internet.
"""

from __future__ import annotations

import hmac
import logging
from contextlib import asynccontextmanager
from typing import Annotated

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from sismocol import analisis, db, servicio
from sismocol.config import Ajustes, ajustes
from sismocol.ingest import FUENTES, ErrorIngesta

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("sismocol.app")

BYTES_POR_MB = 1024 * 1024


def verificar_token(x_token_interno: Annotated[str | None, Header()] = None) -> None:
    esperado = ajustes().analytics_token
    if x_token_interno is None or not hmac.compare_digest(x_token_interno, esperado):
        raise HTTPException(status_code=401, detail="Token interno inválido")


def _tarea_sincronizacion() -> None:
    cfg = ajustes()
    resultado = servicio.sincronizar(cfg)
    log.info("Sincronización programada: %s", resultado)
    # D6: después de sincronizar se recalcula el análisis (aunque no haya datos nuevos, avanza la ventana).
    analisis.recalcular_en_segundo_plano(cfg.database_url)


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    cfg = ajustes()
    programador = BackgroundScheduler(timezone=cfg.zona_horaria)
    programador.add_job(_tarea_sincronizacion, CronTrigger.from_crontab(cfg.cron_sincronizacion),
                        id="sincronizacion", max_instances=1, coalesce=True)
    programador.start()
    # Primer arranque con catálogo pero sin análisis guardado (p. ej. tras cargar el Excel en una versión anterior).
    try:
        if not analisis.hay_analisis(cfg.database_url):
            analisis.recalcular_en_segundo_plano(cfg.database_url)
    except Exception:
        log.exception("No se pudo comprobar el análisis guardado")
    log.info("Programador iniciado: sincronización '%s' (%s)", cfg.cron_sincronizacion,
             cfg.zona_horaria)
    try:
        yield
    finally:
        programador.shutdown(wait=False)


app = FastAPI(title="SismoCol Analytics", version="0.2.0", lifespan=ciclo_de_vida,
              docs_url=None, redoc_url=None, openapi_url=None)
Protegido = Annotated[None, Depends(verificar_token)]
Config = Annotated[Ajustes, Depends(ajustes)]


@app.exception_handler(analisis.ZonaNoEncontrada)
async def manejar_zona(_, error: analisis.ZonaNoEncontrada) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": str(error)})


@app.exception_handler(analisis.SinDatos)
async def manejar_sin_datos(_, error: analisis.SinDatos) -> JSONResponse:
    return JSONResponse(status_code=409, content={"error": str(error)})


@app.exception_handler(ErrorIngesta)
async def manejar_error_ingesta(_, error: ErrorIngesta) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": str(error)})


@app.get("/health")
def salud(cfg: Config) -> dict[str, str]:
    try:
        db.ping(cfg.database_url)
    except Exception:
        log.exception("Health: base de datos no disponible")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    return {"estado": "ok"}


@app.post("/ingest", status_code=201)
def ingerir(
    _: Protegido,
    cfg: Config,
    archivo: Annotated[UploadFile, File()],
    fuente: Annotated[str | None, Form()] = None,
    zona_horaria: Annotated[str | None, Form()] = None,
    id_usuario: Annotated[int | None, Form()] = None,
) -> dict[str, object]:
    if fuente is not None and fuente not in FUENTES:
        raise HTTPException(status_code=400, detail=f"Fuente no válida: {fuente}")
    contenido = archivo.file.read(int(cfg.max_mb_archivo * BYTES_POR_MB) + 1)
    if len(contenido) > cfg.max_mb_archivo * BYTES_POR_MB:
        raise HTTPException(status_code=413, detail=f"El archivo supera {cfg.max_mb_archivo:g} MB")
    resultado = servicio.ingerir_archivo(cfg, contenido, archivo.filename or "archivo",
                                         id_usuario=id_usuario, fuente=fuente, zona_horaria=zona_horaria)
    analisis.recalcular_en_segundo_plano(cfg.database_url)
    return resultado


@app.post("/sync", status_code=201)
def sincronizar(_: Protegido, cfg: Config) -> dict[str, object]:
    resultado = servicio.sincronizar(cfg)
    analisis.recalcular_en_segundo_plano(cfg.database_url)
    return resultado


# ─── Análisis de frecuencia (fase 4) ────────────────────────────────────────

NIVELES = ("NORMAL", "ELEVADA", "ALTA")


@app.get("/analisis/zonas")
def zonas(_: Protegido, cfg: Config) -> list[dict[str, object]]:
    return analisis.lista_zonas(cfg.database_url)


@app.get("/analisis/frecuencia")
def frecuencia(_: Protegido, cfg: Config, zona: str) -> dict[str, object]:
    return analisis.frecuencia(cfg.database_url, zona)


@app.get("/analisis/gutenberg-richter")
def gutenberg_richter(_: Protegido, cfg: Config, zona: str) -> dict[str, object]:
    return analisis.gutenberg_richter(cfg.database_url, zona)


@app.get("/analisis/probabilidades")
def probabilidades(_: Protegido, cfg: Config) -> dict[str, object]:
    return analisis.probabilidades(cfg.database_url)


@app.get("/analisis/advertencias")
def advertencias(_: Protegido, cfg: Config, zona: str | None = None, nivel: str | None = None) -> dict[str, object]:
    if nivel is not None and nivel not in NIVELES:
        raise HTTPException(status_code=400, detail=f"Nivel no válido: {nivel}")
    return analisis.advertencias(cfg.database_url, zona, nivel)


@app.post("/analisis/recalcular", status_code=202)
def recalcular(_: Protegido, cfg: Config) -> dict[str, object]:
    iniciado = analisis.recalcular_en_segundo_plano(cfg.database_url)
    return {"iniciado": iniciado}
