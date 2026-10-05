# Metodología CRISP-DM en SismoCol

El proyecto sigue las seis fases de CRISP-DM (Cross-Industry Standard Process for Data Mining). Cada fase de desarrollo del sistema produce el documento de su fase CRISP-DM en esta carpeta.

| Fase CRISP-DM | Documento | Fase de desarrollo | Estado |
|---|---|---|---|
| 1. Comprensión del negocio | [01_comprension_negocio.md](01_comprension_negocio.md) | 1 — Base | Listo |
| 2. Comprensión de los datos | [02_comprension_datos.md](02_comprension_datos.md) (generado por `Analytics/eda/barrido_datos.py`) | 1 — Base | Listo |
| 3. Preparación de los datos | `03_preparacion_datos.md` | 2 — Datos (ingesta, limpieza, centroides, cruce USGS/UNGRD) | Pendiente |
| 4. Modelado | `04_modelado.md` | 4 — Análisis de frecuencia · 5 — Modelo de impacto | Pendiente |
| 5. Evaluación | `05_evaluacion.md` + `../resultados_analisis.md` | 4 y 5 (métricas reales, validación de supuestos) | Pendiente |
| 6. Despliegue | `06_despliegue.md` | 3, 6 y 7 (sistema web, ESP32, VPS) | Pendiente |

CRISP-DM es iterativo. Si en la preparación o el modelado aparece algo que cambia la comprensión de los datos, se vuelve a ejecutar el barrido y se actualiza el documento correspondiente.
