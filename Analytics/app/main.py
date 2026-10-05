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

from sismocol import db, servicio
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
    resultado = servicio.sincronizar(ajustes())
    log.info("Sincronización programada: %s", resultado)


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    cfg = ajustes()
    programador = BackgroundScheduler(timezone=cfg.zona_horaria)
    programador.add_job(_tarea_sincronizacion, CronTrigger.from_crontab(cfg.cron_sincronizacion),
                        id="sincronizacion", max_instances=1, coalesce=True)
    programador.start()
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
    return servicio.ingerir_archivo(cfg, contenido, archivo.filename or "archivo",
                                    id_usuario=id_usuario, fuente=fuente, zona_horaria=zona_horaria)


@app.post("/sync", status_code=201)
def sincronizar(_: Protegido, cfg: Config) -> dict[str, object]:
    return servicio.sincronizar(cfg)
