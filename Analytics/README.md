# Analytics — servicio analítico de SismoCol

Python 3.11 + FastAPI + pandas/NumPy/SciPy/scikit-learn + APScheduler. Es un servicio interno: solo lo llama la API (token compartido).

## Estructura

| Ruta | Contenido |
|---|---|
| `app/main.py` | API interna FastAPI: `GET /health`, `POST /ingest`, `POST /sync` y `POST /sync/usgs-historico`. Programa la sincronización diaria con APScheduler |
| `sismocol/ingest.py` | Tubería de ingesta y limpieza (CRISP-DM fase 3) |
| `sismocol/municipios.py` | Resolución contra la DIVIPOLA: centroides y municipio más cercano |
| `sismocol/fuentes/` | Clientes de USGS FDSN y UNGRD (datos.gov.co), con reintentos |
| `sismocol/servicio.py` | Orquesta la ingesta de archivos y la sincronización |
| `sismocol/comandos.py` | Comandos de administración (`usgs-historico`) |
| `sismocol/analisis.py` | Frecuencia por zona, Gutenberg-Richter, tendencia y advertencias; el recálculo también corre réplicas, pronóstico y amenaza |
| `sismocol/replicas.py` | Pronóstico de réplicas Reasenberg-Jones y validación retrospectiva (D15) |
| `sismocol/pronostico.py` | Pronóstico mensual por zona: SARIMA contra ingenuo y media móvil, backtesting (D16) |
| `sismocol/amenaza.py` | Periodo de retorno y mapa de sismicidad suavizada con USGS_HIST (D17) |
| `sismocol/intensidad.py` | MMI de Allen, Wald y Worden (2012) |
| `sismocol/fuentes/dane.py` | Población municipal y déficit habitacional del DANE |
| `sismocol/modelo.py` | Modelo de impacto: variables, comparación con CV, calibración, SHAP, escenarios (D18) |
| `eda/resultados_analitica.py` | Genera `docs/resultados_analitica.md` con las métricas guardadas en la base |
| `sismocol/db.py` | Persistencia en MySQL (SQLAlchemy Core, tablas reflejadas del esquema de Prisma) |
| `config/umbrales_impacto.json` | Reglas de `nivel_impacto` |
| `eda/` | Barrido de datos y vista previa de una carga |

Todos los endpoints, salvo `/health`, exigen la cabecera `X-Token-Interno` con el `ANALYTICS_TOKEN`. El servicio escucha solo en 127.0.0.1.

## Pruebas

```bash
.venv/Scripts/python -m pytest
```

## Catálogo histórico USGS (USGS_HIST)

```bash
.venv/Scripts/python -m sismocol.comandos usgs-historico            # incremental
.venv/Scripts/python -m sismocol.comandos usgs-historico --desde 1973
```

## Informe de resultados de la analítica

Después de cargar los datos, recalcular el análisis, validar las réplicas (Admin → Pronóstico de réplicas → «Ejecutar validación retrospectiva») y entrenar el modelo:

```bash
.venv/bin/python -m eda.resultados_analitica --salida ../docs/resultados_analitica.md
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
