# Resultados de la analítica de SismoCol

Generado automáticamente el 2026-11-10 21:27 UTC con `python -m eda.resultados_analitica` a partir de la base de datos. No editar a mano: regenerar después de recalcular. Las técnicas, supuestos y limitaciones están en [decisiones.md](decisiones.md) (D14 a D21).

> Todos los resultados son estimaciones estadísticas validadas con datos pasados. SismoCol no predice la fecha, el lugar ni la magnitud de un sismo.

> **Versión parcial:** la base usada no tiene SGC ni DESINVENTAR. Las secciones que dependen de esas fuentes quedan pendientes y la validación de réplicas usa solo los eventos disponibles (ver sección 0). Regenere el informe en el servidor con todos los datos cargados para obtener los resultados definitivos.

## 0. Datos de la base usada

| Fuente | Registros válidos | Desde | Hasta |
|---|---|---|---|
| USGS | 365 | 2026-01-01 | 2026-11-07 |
| USGS_HIST | 3 937 | 1973-01-05 | 2026-11-07 |

## 1. Catálogo histórico USGS_HIST (D14)

3 937 eventos M ≥ 4,5 entre 1973-01-05 y 2026-11-07 en lat −4,5…13,5, lon −82…−66. Se usa solo para tasas de sismos grandes (sección 4) y como epicentro de los reportes de daño (sección 5).

## 2. Pronóstico de réplicas: validación retrospectiva (Reasenberg-Jones, D15)

Para cada sismo principal se ajusta el modelo con las primeras 24 h, 72 h y 7 días, y se compara el número de réplicas pronosticado (con IC 95 %) con el observado después. «Genérico» usa los parámetros de Reasenberg y Jones (1989) sin ajustar nada a la secuencia. Si los datos no cubren todo el horizonte, solo se compara la parte cubierta (columna «Cobertura»). EAM = error absoluto medio |observadas − esperadas|. Los casos de M 5 y 6 con 0 esperadas y 0 observadas inflan la fracción dentro del IC; por eso se muestra también la fracción solo para M ≥ 4.

### M 7,2 · 2026-06-24 22:04 UTC · 10,37, -68,56 · 10 km de profundidad

Fuentes de la secuencia: USGS. Datos hasta 2026-11-07.

| Ajuste | Método | Réplicas ≥ Mc | p / c (d) / b | Dentro IC 95 % | Dentro IC (M ≥ 4) | EAM | Genérico: dentro IC | Genérico: dentro (M ≥ 4) | Genérico: EAM |
|---|---|---|---|---|---|---|---|---|---|
| 24 h | Genérico (R&J 1989) | 1 | 1,08 / 0,050 / 0,91 | 44,4 % | 0,0 % | 10,87 | 44,4 % | 0,0 % | 10,87 |
| 72 h | Genérico (R&J 1989) | 2 | 1,08 / 0,050 / 0,91 | 66,7 % | 33,3 % | 6,13 | 66,7 % | 33,3 % | 6,13 |
| 168 h | Genérico con a de la secuencia | 5 | 1,08 / 0,050 / 0,91 | 100,0 % | 100,0 % | 0,18 | 77,8 % | 33,3 % | 4,23 |

| Ajuste | Horizonte | M | Observadas | Esperadas [IC 95 %] | Dentro | Cobertura |
|---|---|---|---|---|---|---|
| 24 h | 24 h | ≥ 4 | 1 | 11,33 [5–18] | no | 100 % |
| 24 h | 24 h | ≥ 5 | 0 | 1,39 [0–4] | sí | 100 % |
| 24 h | 24 h | ≥ 6 | 0 | 0,17 [0–1] | sí | 100 % |
| 24 h | 7 días | ≥ 4 | 4 | 32,69 [22–44] | no | 100 % |
| 24 h | 7 días | ≥ 5 | 0 | 4,02 [1–8] | no | 100 % |
| 24 h | 7 días | ≥ 6 | 0 | 0,49 [0–2] | sí | 100 % |
| 24 h | 30 días | ≥ 4 | 6 | 51,59 [38–66] | no | 100 % |
| 24 h | 30 días | ≥ 5 | 0 | 6,35 [2–12] | no | 100 % |
| 24 h | 30 días | ≥ 6 | 0 | 0,78 [0–3] | sí | 100 % |
| 72 h | 24 h | ≥ 4 | 2 | 4,48 [1–9] | sí | 100 % |
| 72 h | 24 h | ≥ 5 | 0 | 0,55 [0–2] | sí | 100 % |
| 72 h | 24 h | ≥ 6 | 0 | 0,07 [0–1] | sí | 100 % |
| 72 h | 7 días | ≥ 4 | 3 | 18,16 [10–27] | no | 100 % |
| 72 h | 7 días | ≥ 5 | 0 | 2,23 [0–6] | sí | 100 % |
| 72 h | 7 días | ≥ 6 | 0 | 0,27 [0–2] | sí | 100 % |
| 72 h | 30 días | ≥ 4 | 5 | 34,64 [24–47] | no | 100 % |
| 72 h | 30 días | ≥ 5 | 0 | 4,26 [1–9] | no | 100 % |
| 72 h | 30 días | ≥ 6 | 0 | 0,52 [0–2] | sí | 100 % |
| 168 h | 24 h | ≥ 4 | 0 | 0,11 [0–1] | sí | 100 % |
| 168 h | 24 h | ≥ 5 | 0 | 0,01 [0–0] | sí | 100 % |
| 168 h | 24 h | ≥ 6 | 0 | 0,00 [0–0] | sí | 100 % |
| 168 h | 7 días | ≥ 4 | 0 | 0,55 [0–2] | sí | 100 % |
| 168 h | 7 días | ≥ 5 | 0 | 0,07 [0–1] | sí | 100 % |
| 168 h | 7 días | ≥ 6 | 0 | 0,01 [0–0] | sí | 100 % |
| 168 h | 30 días | ≥ 4 | 2 | 1,28 [0–4] | sí | 100 % |
| 168 h | 30 días | ≥ 5 | 0 | 0,16 [0–1] | sí | 100 % |
| 168 h | 30 días | ≥ 6 | 0 | 0,02 [0–0] | sí | 100 % |

Avisos del ajuste:

- 1 réplicas ≥ Mc (mínimo 3): parámetros genéricos de Reasenberg y Jones (1989)
- 2 réplicas ≥ Mc (mínimo 3): parámetros genéricos de Reasenberg y Jones (1989)
- 5 réplicas ≥ Mc (mínimo 10 para ajustar p y c): b, p y c genéricos, a estimado con la secuencia (Reasenberg y Jones 1994)
- Menos de 20 réplicas: Mc de respaldo 4.0

### M 7,5 · 2026-06-24 22:05 UTC · 10,60, -67,22 · 10 km de profundidad

Fuentes de la secuencia: USGS. Datos hasta 2026-11-07.

| Ajuste | Método | Réplicas ≥ Mc | p / c (d) / b | Dentro IC 95 % | Dentro IC (M ≥ 4) | EAM | Genérico: dentro IC | Genérico: dentro (M ≥ 4) | Genérico: EAM |
|---|---|---|---|---|---|---|---|---|---|
| 24 h | Genérico con a de la secuencia | 3 | 1,08 / 0,050 / 0,91 | 100,0 % | 100,0 % | 0,33 | 44,4 % | 0,0 % | 22,00 |
| 72 h | Genérico con a de la secuencia | 6 | 1,08 / 0,050 / 0,91 | 100,0 % | 100,0 % | 0,56 | 44,4 % | 0,0 % | 13,58 |
| 168 h | Genérico con a de la secuencia | 6 | 1,08 / 0,050 / 0,91 | 100,0 % | 100,0 % | 0,29 | 55,6 % | 0,0 % | 8,34 |

| Ajuste | Horizonte | M | Observadas | Esperadas [IC 95 %] | Dentro | Cobertura |
|---|---|---|---|---|---|---|
| 24 h | 24 h | ≥ 4 | 0 | 0,57 [0–2] | sí | 100 % |
| 24 h | 24 h | ≥ 5 | 0 | 0,07 [0–1] | sí | 100 % |
| 24 h | 24 h | ≥ 6 | 0 | 0,01 [0–0] | sí | 100 % |
| 24 h | 7 días | ≥ 4 | 3 | 1,64 [0–5] | sí | 100 % |
| 24 h | 7 días | ≥ 5 | 0 | 0,20 [0–1] | sí | 100 % |
| 24 h | 7 días | ≥ 6 | 0 | 0,02 [0–0] | sí | 100 % |
| 24 h | 30 días | ≥ 4 | 3 | 2,58 [0–6] | sí | 100 % |
| 24 h | 30 días | ≥ 5 | 0 | 0,32 [0–2] | sí | 100 % |
| 24 h | 30 días | ≥ 6 | 0 | 0,04 [0–1] | sí | 100 % |
| 72 h | 24 h | ≥ 4 | 0 | 0,35 [0–2] | sí | 100 % |
| 72 h | 24 h | ≥ 5 | 0 | 0,04 [0–1] | sí | 100 % |
| 72 h | 24 h | ≥ 6 | 0 | 0,01 [0–0] | sí | 100 % |
| 72 h | 7 días | ≥ 4 | 0 | 1,40 [0–4] | sí | 100 % |
| 72 h | 7 días | ≥ 5 | 0 | 0,17 [0–1] | sí | 100 % |
| 72 h | 7 días | ≥ 6 | 0 | 0,02 [0–0] | sí | 100 % |
| 72 h | 30 días | ≥ 4 | 0 | 2,67 [0–6] | sí | 100 % |
| 72 h | 30 días | ≥ 5 | 0 | 0,33 [0–2] | sí | 100 % |
| 72 h | 30 días | ≥ 6 | 0 | 0,04 [0–1] | sí | 100 % |
| 168 h | 24 h | ≥ 4 | 0 | 0,13 [0–1] | sí | 100 % |
| 168 h | 24 h | ≥ 5 | 0 | 0,02 [0–0] | sí | 100 % |
| 168 h | 24 h | ≥ 6 | 0 | 0,00 [0–0] | sí | 100 % |
| 168 h | 7 días | ≥ 4 | 0 | 0,66 [0–3] | sí | 100 % |
| 168 h | 7 días | ≥ 5 | 0 | 0,08 [0–1] | sí | 100 % |
| 168 h | 7 días | ≥ 6 | 0 | 0,01 [0–0] | sí | 100 % |
| 168 h | 30 días | ≥ 4 | 0 | 1,54 [0–4] | sí | 100 % |
| 168 h | 30 días | ≥ 5 | 0 | 0,19 [0–1] | sí | 100 % |
| 168 h | 30 días | ≥ 6 | 0 | 0,02 [0–0] | sí | 100 % |

Avisos del ajuste:

- 3 réplicas ≥ Mc (mínimo 10 para ajustar p y c): b, p y c genéricos, a estimado con la secuencia (Reasenberg y Jones 1994)
- 6 réplicas ≥ Mc (mínimo 10 para ajustar p y c): b, p y c genéricos, a estimado con la secuencia (Reasenberg y Jones 1994)
- Menos de 20 réplicas: Mc de respaldo 4.0

### M 7,4 · 2026-08-10 12:34 UTC · San José del Palmar (Chocó) · 116 km de profundidad

Fuentes de la secuencia: USGS. Datos hasta 2026-11-07.

| Ajuste | Método | Réplicas ≥ Mc | p / c (d) / b | Dentro IC 95 % | Dentro IC (M ≥ 4) | EAM | Genérico: dentro IC | Genérico: dentro (M ≥ 4) | Genérico: EAM |
|---|---|---|---|---|---|---|---|---|---|
| 24 h | Genérico (R&J 1989) | 2 | 1,08 / 0,050 / 0,91 | 44,4 % | 0,0 % | 16,72 | 44,4 % | 0,0 % | 16,72 |
| 72 h | Genérico con a de la secuencia | 3 | 1,08 / 0,050 / 0,91 | 77,8 % | 33,3 % | 1,57 | 66,7 % | 33,3 % | 9,24 |
| 168 h | Genérico con a de la secuencia | 5 | 1,08 / 0,050 / 0,91 | 88,9 % | 66,7 % | 2,06 | 66,7 % | 33,3 % | 4,54 |

| Ajuste | Horizonte | M | Observadas | Esperadas [IC 95 %] | Dentro | Cobertura |
|---|---|---|---|---|---|---|
| 24 h | 24 h | ≥ 4 | 1 | 17,23 [10–26] | no | 100 % |
| 24 h | 24 h | ≥ 5 | 0 | 2,12 [0–5] | sí | 100 % |
| 24 h | 24 h | ≥ 6 | 0 | 0,26 [0–2] | sí | 100 % |
| 24 h | 7 días | ≥ 4 | 3 | 49,70 [36–64] | no | 100 % |
| 24 h | 7 días | ≥ 5 | 0 | 6,11 [2–11] | no | 100 % |
| 24 h | 7 días | ≥ 6 | 0 | 0,75 [0–3] | sí | 100 % |
| 24 h | 30 días | ≥ 4 | 11 | 78,45 [62–96] | no | 100 % |
| 24 h | 30 días | ≥ 5 | 0 | 9,65 [4–16] | no | 100 % |
| 24 h | 30 días | ≥ 6 | 0 | 1,19 [0–4] | sí | 100 % |
| 72 h | 24 h | ≥ 4 | 2 | 0,17 [0–1] | no | 100 % |
| 72 h | 24 h | ≥ 5 | 0 | 0,02 [0–0] | sí | 100 % |
| 72 h | 24 h | ≥ 6 | 0 | 0,00 [0–0] | sí | 100 % |
| 72 h | 7 días | ≥ 4 | 2 | 0,70 [0–3] | sí | 100 % |
| 72 h | 7 días | ≥ 5 | 0 | 0,09 [0–1] | sí | 100 % |
| 72 h | 7 días | ≥ 6 | 0 | 0,01 [0–0] | sí | 100 % |
| 72 h | 30 días | ≥ 4 | 12 | 1,34 [0–4] | no | 100 % |
| 72 h | 30 días | ≥ 5 | 0 | 0,16 [0–1] | sí | 100 % |
| 72 h | 30 días | ≥ 6 | 0 | 0,02 [0–0] | sí | 100 % |
| 168 h | 24 h | ≥ 4 | 0 | 0,11 [0–1] | sí | 100 % |
| 168 h | 24 h | ≥ 5 | 0 | 0,01 [0–0] | sí | 100 % |
| 168 h | 24 h | ≥ 6 | 0 | 0,00 [0–0] | sí | 100 % |
| 168 h | 7 días | ≥ 4 | 2 | 0,55 [0–2] | sí | 100 % |
| 168 h | 7 días | ≥ 5 | 0 | 0,07 [0–1] | sí | 100 % |
| 168 h | 7 días | ≥ 6 | 0 | 0,01 [0–0] | sí | 100 % |
| 168 h | 30 días | ≥ 4 | 18 | 1,28 [0–4] | no | 100 % |
| 168 h | 30 días | ≥ 5 | 0 | 0,16 [0–1] | sí | 100 % |
| 168 h | 30 días | ≥ 6 | 0 | 0,02 [0–0] | sí | 100 % |

Avisos del ajuste:

- 2 réplicas ≥ Mc (mínimo 3): parámetros genéricos de Reasenberg y Jones (1989)
- 3 réplicas ≥ Mc (mínimo 10 para ajustar p y c): b, p y c genéricos, a estimado con la secuencia (Reasenberg y Jones 1994)
- 5 réplicas ≥ Mc (mínimo 10 para ajustar p y c): b, p y c genéricos, a estimado con la secuencia (Reasenberg y Jones 1994)
- Menos de 20 réplicas: Mc de respaldo 4.0

### M 7,7 · 2026-10-09 17:56 UTC · 7,61, -80,76 · 10 km de profundidad

Fuentes de la secuencia: USGS. Datos hasta 2026-11-07.

| Ajuste | Método | Réplicas ≥ Mc | p / c (d) / b | Dentro IC 95 % | Dentro IC (M ≥ 4) | EAM | Genérico: dentro IC | Genérico: dentro (M ≥ 4) | Genérico: EAM |
|---|---|---|---|---|---|---|---|---|---|
| 24 h | Máxima verosimilitud | 44 | 1,75 / 0,076 / 1,20 | 100,0 % | 100,0 % | 2,56 | 25,0 % | 0,0 % | 22,22 |
| 72 h | Máxima verosimilitud | 46 | 2,04 / 0,102 / 1,23 | 75,0 % | 100,0 % | 4,56 | 58,3 % | 33,3 % | 12,07 |
| 168 h | Máxima verosimilitud | 51 | 1,53 / 0,054 / 1,21 | 100,0 % | 100,0 % | 0,77 | 58,3 % | 33,3 % | 8,48 |

| Ajuste | Horizonte | M | Observadas | Esperadas [IC 95 %] | Dentro | Cobertura |
|---|---|---|---|---|---|---|
| 24 h | 24 h | ≥ 4 | 7 | 18,75 [2–74] | sí | 100 % |
| 24 h | 24 h | ≥ 5 | 1 | 2,70 [0–11] | sí | 100 % |
| 24 h | 24 h | ≥ 5 | 0 | 1,18 [0–5] | sí | 100 % |
| 24 h | 24 h | ≥ 6 | 0 | 0,07 [0–1] | sí | 100 % |
| 24 h | 7 días | ≥ 4 | 32 | 37,50 [4–270] | sí | 100 % |
| 24 h | 7 días | ≥ 5 | 7 | 5,40 [0–36] | sí | 100 % |
| 24 h | 7 días | ≥ 5 | 2 | 2,36 [0–16] | sí | 100 % |
| 24 h | 7 días | ≥ 6 | 1 | 0,15 [0–2] | sí | 100 % |
| 24 h | 30 días | ≥ 4 | 40 | 44,00 [4–570] | sí | 93 % |
| 24 h | 30 días | ≥ 5 | 9 | 6,34 [0–74] | sí | 93 % |
| 24 h | 30 días | ≥ 5 | 3 | 2,76 [0–34] | sí | 93 % |
| 24 h | 30 días | ≥ 6 | 1 | 0,17 [0–3] | sí | 93 % |
| 72 h | 24 h | ≥ 4 | 8 | 2,52 [0–15] | sí | 100 % |
| 72 h | 24 h | ≥ 5 | 4 | 0,34 [0–3] | no | 100 % |
| 72 h | 24 h | ≥ 5 | 2 | 0,15 [0–1] | no | 100 % |
| 72 h | 24 h | ≥ 6 | 1 | 0,01 [0–0] | no | 100 % |
| 72 h | 7 días | ≥ 4 | 19 | 7,07 [0–55] | sí | 100 % |
| 72 h | 7 días | ≥ 5 | 5 | 0,97 [0–8] | sí | 100 % |
| 72 h | 7 días | ≥ 5 | 2 | 0,41 [0–4] | sí | 100 % |
| 72 h | 7 días | ≥ 6 | 1 | 0,02 [0–1] | sí | 100 % |
| 72 h | 30 días | ≥ 4 | 24 | 9,03 [0–102] | sí | 87 % |
| 72 h | 30 días | ≥ 5 | 7 | 1,24 [0–13] | sí | 87 % |
| 72 h | 30 días | ≥ 5 | 3 | 0,53 [0–6] | sí | 87 % |
| 72 h | 30 días | ≥ 6 | 1 | 0,03 [0–1] | sí | 87 % |
| 168 h | 24 h | ≥ 4 | 2 | 2,00 [0–8] | sí | 100 % |
| 168 h | 24 h | ≥ 5 | 0 | 0,29 [0–2] | sí | 100 % |
| 168 h | 24 h | ≥ 5 | 0 | 0,12 [0–1] | sí | 100 % |
| 168 h | 24 h | ≥ 6 | 0 | 0,01 [0–0] | sí | 100 % |
| 168 h | 7 días | ≥ 4 | 8 | 9,03 [1–34] | sí | 100 % |
| 168 h | 7 días | ≥ 5 | 0 | 1,29 [0–5] | sí | 100 % |
| 168 h | 7 días | ≥ 5 | 0 | 0,56 [0–3] | sí | 100 % |
| 168 h | 7 días | ≥ 6 | 0 | 0,03 [0–1] | sí | 100 % |
| 168 h | 30 días | ≥ 4 | 10 | 15,57 [3–63] | sí | 73 % |
| 168 h | 30 días | ≥ 5 | 2 | 2,23 [0–9] | sí | 73 % |
| 168 h | 30 días | ≥ 5 | 1 | 0,97 [0–5] | sí | 73 % |
| 168 h | 30 días | ≥ 6 | 0 | 0,06 [0–1] | sí | 73 % |

## 3. Pronóstico de actividad mensual por zona: backtesting

> **Sin datos en la base usada para generar este informe.** Ejecute el cálculo en el servidor (con el catálogo del SGC y los reportes de daño cargados) y regenere el informe.

## 4. Periodo de retorno y mapa de amenaza (D17)

Catálogo USGS_HIST (M ≥ 4,5) del 1973-01-05 al 2026-11-07 (53,8 años): 3 937 eventos, 2 334 tras depurar réplicas (Gardner-Knopoff (1974)). Mc = 4,7 (por década: 1970s 4,9, 1980s 4,9, 1990s 4,7, 2000s 4,7, 2010s 4,7, 2020s 4,7). b regional = 0,977 ± 0,028.

Zonas con análisis propio (las agrupadas comparten la tasa de su región y se listan aparte):

| Zona | Eventos ≥ Mc | b | Tr M5 (años) | Tr M6 (años) | Tr M7 (años) | P(M6) 30 d | P(M6) 1 a | P(M6) 10 a | P(M6) 50 a |
|---|---|---|---|---|---|---|---|---|---|
| Chocó | 129 | 0,84 | 0,7 [0,7–0,8] | 5,2 [4,1–6,5] | 36,0 [24,0–54,1] | 1,6 % | 17,5 % | 85,5 % | 100,0 % |
| Nido de Bucaramanga | 134 | 1,32 | 1,0 [0,9–1,1] | 20,9 [15,8–27,6] | 435,6 [266,0–713,5] (extrap.) | 0,4 % | 4,7 % | 38,1 % | 90,9 % |
| Antioquia | 62 | 1,09 | 1,8 [1,6–2,1] | 22,4 [13,7–36,7] | 272,8 [114,0–653,1] | 0,4 % | 4,4 % | 36,0 % | 89,3 % |
| Valle del Cauca | 41 | 1,15 | 2,9 [2,5–3,3] | 40,5 [21,8–75,2] | 564,9 [188,8–1 690,7] (extrap.) | 0,2 % | 2,4 % | 21,9 % | 70,9 % |
| Nariño | 36 | 0,98 | 2,9 [2,6–3,3] | 28,4 [17,2–46,9] | 273,2 [112,4–664,0] (extrap.) | 0,3 % | 3,5 % | 29,7 % | 82,8 % |

| Región | Zonas | b | Tr M5 (años) | Tr M6 (años) | Tr M7 (años) | P(M6) 30 d | P(M6) 1 a | P(M6) 10 a | P(M6) 50 a |
|---|---|---|---|---|---|---|---|---|---|
| Región Andina | Boyacá, Caldas, Cundinamarca, Huila, Norte de Santander, Quindío, Risaralda, Santander, Tolima | 1,09 | 0,4 [0,4–0,4] | 4,9 [4,0–6,0] | 61,0 [42,7–87,3] | 1,7 % | 18,4 % | 86,9 % | 100,0 % |
| Región Pacífica | Cauca | 0,90 | 0,4 [0,4–0,5] | 3,6 [3,0–4,3] | 28,8 [20,5–40,5] | 2,3 % | 24,3 % | 93,9 % | 100,0 % |
| Región Orinoquía | Arauca, Casanare, Meta | 0,99 | 2,7 [2,5–3,0] | 27,0 [17,3–42,3] | 266,0 [120,4–587,6] (extrap.) | 0,3 % | 3,6 % | 30,9 % | 84,3 % |
| Región Caribe | Atlántico, Bolívar, Cesar, Córdoba, La Guajira, Magdalena, San Andrés y Providencia, Sucre | 1,35 | 2,9 [2,4–3,3] | 64,5 [33,1–125,8] | 1 456,3 [446,9–4 745,1] (extrap.) | 0,1 % | 1,5 % | 14,4 % | 53,9 % |

Mapa de sismicidad suavizada (Frankel 1995, c = 50 km, celdas de 0,5°): 1152 celdas; P(M ≥ 5 en 10 años) máxima 95,3 %, mediana 1,8 %, percentil 90 32,0 %.

## 5. Modelo de impacto

> **Sin datos en la base usada para generar este informe.** Ejecute el cálculo en el servidor (con el catálogo del SGC y los reportes de daño cargados) y regenere el informe.


