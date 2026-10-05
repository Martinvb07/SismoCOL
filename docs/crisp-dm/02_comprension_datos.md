# Comprensión de los datos — barrido del dataset

> CRISP-DM fase 2. Generado por `Analytics/eda/barrido_datos.py` el 2026-10-05 12:19 sobre `Sismos_Colombia_FINAL.xlsx`. No editar a mano: volver a ejecutar el script.

## 1. Estructura del archivo

Hojas: `Datos`, `Resumen`, `Notas`. Se analiza `Datos` (99.932 filas × 21 columnas).

| columna              | tipo           |   nulos | % nulos   |
|:---------------------|:---------------|--------:|:----------|
| ID_Evento            | object         |       0 | 0,0 %     |
| Fecha                | datetime64[ns] |       0 | 0,0 %     |
| Departamento         | object         |       0 | 0,0 %     |
| Municipio            | object         |       0 | 0,0 %     |
| Magnitud             | float64        |     492 | 0,5 %     |
| Profundidad_km       | float64        |     590 | 0,6 %     |
| Muertos              | float64        |   98889 | 99,0 %    |
| Heridos              | float64        |   98889 | 99,0 %    |
| Desaparecidos        | float64        |   98889 | 99,0 %    |
| Viviendas_Destruidas | float64        |   98889 | 99,0 %    |
| Viviendas_Afectadas  | float64        |   98889 | 99,0 %    |
| Damnificados         | float64        |   98889 | 99,0 %    |
| Afectados            | float64        |   98889 | 99,0 %    |
| Reubicados           | float64        |   98927 | 99,0 %    |
| Evacuados            | float64        |   98927 | 99,0 %    |
| Perdidas_USD         | float64        |   98927 | 99,0 %    |
| Centros_Educativos   | float64        |   98889 | 99,0 %    |
| Centros_Medicos      | float64        |   98889 | 99,0 %    |
| Danos_Vias_Mts       | float64        |   98889 | 99,0 %    |
| Fuente_Dataset       | object         |       0 | 0,0 %     |
| Tipo_Registro        | object         |       0 | 0,0 %     |

**Hallazgo crítico:** el archivo **no tiene latitud ni longitud**. La ubicación solo existe como departamento + municipio.

### Tramos de datos


| Fuente_Dataset       | Tipo_Registro             |   filas | desde      | hasta      |   con_magnitud |   con_profundidad |
|:---------------------|:--------------------------|--------:|:-----------|:-----------|---------------:|------------------:|
| DesInventar          | Reporte_de_Danos          |    1010 | 1917-08-29 | 2017-02-06 |            524 |               426 |
| SGC_Catalogo_Sismico | Sismo_Detectado_2022_2026 |   98884 | 2022-11-10 | 2026-08-26 |          98884 |             98884 |
| UNGRD_datos.gov.co   | Reporte_de_Danos          |      38 | 2019-05-24 | 2022-11-10 |             32 |                32 |


## 2. Calidad de los datos


| chequeo                            |   filas | tratamiento propuesto                                       |
|:-----------------------------------|--------:|:------------------------------------------------------------|
| IDs repetidos (filas involucradas) |     160 | Reportes de daño: un evento repetido por municipio afectado |
| Magnitud nula                      |     492 | Solo en reportes de daño                                    |
| Profundidad nula                   |     590 | Solo en reportes de daño                                    |
| Profundidad negativa               |     367 | Sismos SGC sobre el nivel del mar: anómalo, se conserva     |
| Magnitud negativa                  |       7 | Microsismos; válidos físicamente pero bajo Mc               |
| Magnitud > 9                       |       0 | Fuera de rango físico                                       |

En el tramo SGC hay 0 IDs repetidos.
Duplicados probables en SGC (±5 s, mismo municipio, |ΔM| ≤ 0,1): **28**. En la ingesta se usará la distancia < 5 km con las coordenadas asignadas.

### Departamentos

Hay 49 escrituras distintas de departamento; tras normalizar quedan 30 departamentos canónicos.
No corresponden a Colombia (se marcan como anómalos, `fuera de Colombia`):

| valor original   |   filas |
|:-----------------|--------:|
| Carchi, Ecuador  |       5 |
| PERÚ             |       1 |


## 3. Cobertura temporal y zona horaria

Tramo SGC: 2022-11-10 → 2026-08-26 (3,79 años, 46 meses). Eventos por mes: mínimo 1366, mediana 2175, máximo 2934 (2024-01).
Meses sin eventos: 0. El primer y último mes están incompletos y deben excluirse de la serie de tendencia.
Los reportes de daño (1917–2022) solo traen fecha, sin hora.

### ¿UTC u hora local?

Se emparejaron los 676 sismos SGC con M ≥ 3,5 contra el catálogo USGS (UTC) con tolerancia de ±30 s:

| hipótesis                                                  |   coincidencias |
|:-----------------------------------------------------------|----------------:|
| Fecha del Excel interpretada como UTC                      |             312 |
| Fecha del Excel interpretada como hora de Colombia (UTC−5) |               1 |

**Conclusión:** las fechas del tramo SGC están en **UTC**.
En la base se guardan en UTC y el frontend las muestra en America/Bogota.

## 4. Magnitudes y zonas de análisis


| umbral   |   sismos SGC |
|:---------|-------------:|
| M ≥ 2    |        26753 |
| M ≥ 3    |         2191 |
| M ≥ 4    |          225 |
| M ≥ 5    |           25 |
| M ≥ 6    |            3 |
| M ≥ 7    |            1 |

Mc global (máxima curvatura + 0,2): **1,9**. Mediana de magnitud: 1,7. Máximo: 7,4.

### Eventos por zona (Nido de Bucaramanga separado)


| zona                     | región        |   eventos |   prof. mediana km |   M máx | Mc   |   eventos ≥ Mc |   ≥ Mc por año |
|:-------------------------|:--------------|----------:|-------------------:|--------:|:-----|---------------:|---------------:|
| Nido de Bucaramanga      | Andina (nido) |     48804 |                141 |     5.8 | 1.9  |          22014 |         5805.5 |
| Antioquia                | Andina        |     10077 |                 18 |     5.3 | 1.7  |           3527 |          930.1 |
| Cundinamarca             | Andina        |      4759 |                 28 |     6.4 | 2.1  |           1214 |          320.2 |
| Meta                     | Orinoquía     |      4515 |                 13 |     6.1 | 1.4  |           2160 |          569.6 |
| Chocó                    | Pacífica      |      4498 |                 38 |     7.4 | 1.9  |           2124 |          560.1 |
| Valle del Cauca          | Pacífica      |      3744 |                 87 |     5.6 | 1.9  |           1371 |          361.6 |
| Huila                    | Andina        |      3424 |                 24 |     4.4 | 1.5  |           1693 |          446.5 |
| Cesar                    | Caribe        |      2521 |                 87 |     3.7 | 1.8  |            785 |          207   |
| Boyacá                   | Andina        |      2422 |                 22 |     3.9 | 1.9  |            825 |          217.6 |
| Tolima                   | Andina        |      2257 |                 20 |     4.5 | 1.3  |           1010 |          266.4 |
| Norte de Santander       | Andina        |      2148 |                122 |     4.7 | 1.8  |            951 |          250.8 |
| Santander                | Andina        |      2117 |                 32 |     4.4 | 1.6  |            817 |          215.5 |
| Bolívar                  | Caribe        |      1188 |                 46 |     3.9 | 1.6  |            549 |          144.8 |
| Magdalena                | Caribe        |       888 |                 28 |     4.3 | 1.8  |            288 |           76   |
| La Guajira               | Caribe        |       813 |                 35 |     4.6 | 2.0  |            253 |           66.7 |
| Nariño                   | Pacífica      |       715 |                 12 |     3.7 | 1.6  |            419 |          110.5 |
| Caldas                   | Andina        |       660 |                 14 |     3.9 | 1.2  |            231 |           60.9 |
| Quindío                  | Andina        |       562 |                 14 |     4.3 | 1.2  |            296 |           78.1 |
| Cauca                    | Pacífica      |       521 |                 19 |     4.1 | 1.6  |            275 |           72.5 |
| Risaralda                | Andina        |       462 |                 47 |     3.7 | 1.3  |            247 |           65.1 |
| Caquetá                  | Amazonía      |       443 |                 21 |     4.3 | 1.6  |            215 |           56.7 |
| Córdoba                  | Caribe        |       320 |                 31 |     4.4 | 1.7  |            132 |           34.8 |
| Arauca                   | Orinoquía     |       310 |                 16 |     4   | 1.9  |            137 |           36.1 |
| Putumayo                 | Amazonía      |       258 |                 11 |     3.4 | 1.5  |            131 |           34.5 |
| Casanare                 | Orinoquía     |       226 |                 16 |     4.8 | 1.9  |            131 |           34.5 |
| Sucre                    | Caribe        |       154 |                 30 |     4.3 | 1.5  |            103 |           27.2 |
| Guaviare                 | Amazonía      |        36 |                  0 |     3.3 | 2.0  |             20 |            5.3 |
| Atlántico                | Caribe        |        27 |                 30 |     3.2 | 1.9  |             14 |            3.7 |
| Vichada                  | Orinoquía     |         9 |                  3 |     2.8 | —    |              0 |            0   |
| San Andrés y Providencia | Caribe        |         1 |                 35 |     2.1 | —    |              0 |            0   |

Zonas con menos de 50 eventos ≥ Mc (se agruparán con su región para Gutenberg-Richter): Guaviare, Atlántico, Vichada, San Andrés y Providencia.
El Nido de Bucaramanga concentra 48.804 eventos (49,4 % del tramo SGC); mezclarlo con el resto de Santander sesgaría el valor b y las advertencias.

## 5. Ubicación: centroides DIVIPOLA y cruce con USGS

Fuente: DIVIPOLA del DANE (datos.gov.co `gdxc-w37w`, 1.122 municipios). Coincidencia exacta por (departamento, municipio) normalizados:

| Fuente_Dataset       | coincidencia   |
|:---------------------|:---------------|
| DesInventar          | 93,8 %         |
| SGC_Catalogo_Sismico | 97,9 %         |
| UNGRD_datos.gov.co   | 89,5 %         |

Sin coincidencia: 2.160 filas. Las más frecuentes (requieren alias o búsqueda aproximada en la ingesta):

| departamento       | Municipio          |   filas |
|:-------------------|:-------------------|--------:|
| Santander          | El Carmen          |    1109 |
| Valle del Cauca    | Buga               |     244 |
| Cesar              | Becerrill          |     120 |
| Cundinamarca       | Ubaté              |      91 |
| Chocó              | El Carmen          |      86 |
| Tolima             | Mariquita          |      83 |
| Bolívar            | Rioviejo           |      60 |
| Valle del Cauca    | Cali               |      42 |
| La Guajira         | Hato Nuevo         |      41 |
| Norte de Santander | Cúcuta             |      39 |
| Cauca              | López              |      38 |
| Boyacá             | Guicán             |      38 |
| Nariño             | Tumaco             |      20 |
| Bogotá D.C.        | Bogota             |      16 |
| Cauca              | Sotará (Paispamba) |      14 |

Nombres de municipio que existen en más de un departamento: 67 — por eso el cruce siempre usa el par (departamento, municipio).

### Epicentros reales desde USGS

El servicio FDSN del SGC (`sismo.sgc.gov.co:8080/fdsnws/event/1`) respondió 404 a todas las consultas (consultado el 2026-10-05). El FDSN de USGS sí responde: 733 eventos M ≥ 2,5 en el bbox de Colombia para el mismo periodo, frente a 6.940 sismos SGC con M ≥ 2,5. USGS solo cubre una fracción: el resto quedará con el centroide municipal (`precision_ubicacion = CENTROIDE_MUNICIPIO`).

## 6. Etiquetas de impacto (reportes de daño)

Aplicando las reglas de `nivel_impacto` (ALTO: fallecidos ≥ 1 o viviendas destruidas ≥ 50; MODERADO: heridos ≥ 1 o viviendas destruidas ≥ 1; BAJO: afectados, damnificados o viviendas averiadas ≥ 1):

| nivel          |   sin magnitud o profundidad |   con magnitud y profundidad |   total |
|:---------------|-----------------------------:|-----------------------------:|--------:|
| ALTO           |                          134 |                           46 |     180 |
| BAJO           |                           86 |                          183 |     269 |
| MODERADO       |                          181 |                          120 |     301 |
| SIN_AFECTACION |                          219 |                           74 |     293 |
| total          |                          620 |                          423 |    1043 |

Los 1.043 reportes corresponden a 203 eventos (fecha, fuente): en promedio 5,1 municipios por evento, máximo 87. Cada fila es el impacto de un sismo **en un municipio**, que es justo lo que predice el formulario (magnitud, profundidad y punto).
Para la clase SIN_AFECTACION se sumará una muestra de sismos SGC con M ≥ 3,5 sin reporte UNGRD en su municipio y fecha (decisión documentada en `docs/decisiones.md`).

## 7. Implicaciones para la preparación de datos (CRISP-DM fase 3)

- Normalizar departamentos al nombre canónico; los extranjeros se marcan `fuera de Colombia`.
- Asignar coordenadas: epicentro USGS cuando hay pareja (±30 s, |ΔM| ≤ 0,5), si no el centroide DIVIPOLA.
- Convertir fechas según la zona horaria verificada en la sección 3 y guardarlas en UTC.
- Profundidades negativas, magnitudes nulas y municipios sin coordenadas: `es_anomalo` con motivo, sin borrar.
- Clave de idempotencia `fuente|id_evento|municipio` porque un mismo ID de daño se repite por municipio.
- Separar la zona Nido de Bucaramanga (Santander, profundidad > 100 km).
- Para Gutenberg-Richter y tendencia usar solo el tramo SGC (los reportes de daño no son un catálogo).
