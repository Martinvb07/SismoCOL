# Analytics — servicio analítico de SismoCol

Python 3.11 + FastAPI + pandas/NumPy/SciPy/scikit-learn + APScheduler. Es un servicio interno: solo lo llama la API (token compartido).

Estado: en la fase 1 solo existen el módulo territorial (`sismocol/territorio.py`) y el barrido de datos (`eda/`). La ingesta, el análisis de frecuencia y el modelo de impacto se agregan en las fases 2, 4 y 5.

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
