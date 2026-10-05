# Analytics — servicio analítico de SismoCol

Python 3.11 + FastAPI + pandas/NumPy/SciPy/scikit-learn + APScheduler. Es un servicio interno: solo lo llama la API (token compartido).

## Estructura

| Ruta | Contenido |
|---|---|
| `app/main.py` | API interna FastAPI: `GET /health`, `POST /ingest` y `POST /sync`. Programa la sincronización diaria con APScheduler |
| `sismocol/ingest.py` | Tubería de ingesta y limpieza (CRISP-DM fase 3) |
| `sismocol/municipios.py` | Resolución contra la DIVIPOLA: centroides y municipio más cercano |
| `sismocol/fuentes/` | Clientes de USGS FDSN y UNGRD (datos.gov.co), con reintentos |
| `sismocol/servicio.py` | Orquesta la ingesta de archivos y la sincronización |
| `sismocol/db.py` | Persistencia en MySQL (SQLAlchemy Core, tablas reflejadas del esquema de Prisma) |
| `config/umbrales_impacto.json` | Reglas de `nivel_impacto` |
| `eda/` | Barrido de datos y vista previa de una carga |

Todos los endpoints, salvo `/health`, exigen la cabecera `X-Token-Interno` con el `ANALYTICS_TOKEN`. El servicio escucha solo en 127.0.0.1.

## Pruebas

```bash
.venv/Scripts/python -m pytest
```

## Vista previa de una carga (sin escribir en la base)

```bash
.venv/Scripts/python -m eda.vista_previa_ingesta ../data/raw/Sismos_Colombia_FINAL.xlsx
```

## Entorno

```bash
# Windows
py -3.11 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt

# Linux (VPS)
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Barrido de datos (CRISP-DM fase 2)

```bash
.venv/Scripts/python -m eda.descargar_referencias --destino ../data/ref
.venv/Scripts/python -m eda.barrido_datos \
    --excel ../data/raw/Sismos_Colombia_FINAL.xlsx \
    --divipola ../data/ref/divipola_municipios.json \
    --usgs ../data/ref/usgs_colombia_m25.csv \
    --salida ../docs/crisp-dm/02_comprension_datos.md
```
