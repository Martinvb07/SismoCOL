# Preparación de los datos

> CRISP-DM fase 3 · Implementada en `Analytics/sismocol/ingest.py` (pipeline), `municipios.py` (DIVIPOLA), `fuentes/` (USGS y UNGRD) y `servicio.py` (orquestación). Hay 54 pruebas unitarias en `Analytics/tests/`.

## 1. Flujo de la ingesta

```
archivo CSV/XLSX ─┐
API USGS ─────────┼─► leer ─► mapear columnas ─► normalizar ─► georreferenciar ─► enriquecer (USGS)
API UNGRD ────────┘                                                                   │
        MySQL ◄── guardar (idempotente) ◄── zona + nivel_impacto ◄── claves ◄── anomalías y duplicados
```

Cada paso es una función pura sobre un `DataFrame`, así que se puede probar aislada. La misma tubería procesa los archivos que sube el admin y las sincronizaciones automáticas.

## 2. Selección de datos

| Se incluye | Se excluye y por qué |
|---|---|
| Fecha, magnitud, profundidad, departamento, municipio, fuente | — |
| Afectaciones: fallecidos, heridos, desaparecidos, personas afectadas, damnificados, viviendas destruidas y averiadas, **centros educativos y de salud** | Reubicados (1 fila con valor > 0), evacuados (11), pérdidas en USD (2) y daños en vías (23): casi vacías, no aportan al análisis |
| Columnas extra de un archivo | Se reportan como "ignoradas" en el reporte de carga |

## 3. Limpieza

**Principio: los anómalos se marcan, no se borran.** Cada registro lleva `es_anomalo` y `motivo_anomalia`, y puede tener varios motivos separados por "; ". Así queda la trazabilidad completa y el análisis decide qué filtrar.

| Regla | Motivo registrado | Casos en el Excel |
|---|---|---|
| Magnitud vacía | `magnitud nula` | 492 (reportes de daño antiguos) |
| Profundidad vacía | `profundidad nula` | 590 |
| Profundidad < 0 km | `profundidad negativa` | 367 (SGC: hipocentros sobre el nivel del mar) |
| Magnitud fuera de [−3, 10] o profundidad > 700 km | `… fuera de rango` | 0 |
| Departamento de un país vecino, o coordenadas fuera del bbox (lat −4,3…13,5; lon −82…−66,8) | `fuera de Colombia` | 6 (Carchi-Ecuador, Perú) |
| Municipio no resoluble y sin coordenadas | `sin ubicación` | 1 ("Océano Pacífico") |
| ±5 s, < 5 km y \|ΔM\| ≤ 0,1 respecto a un registro anterior de la misma fuente (en reportes de daño, además, el mismo municipio) | `duplicado` | 53 en SGC |
| Misma clave de origen dentro del archivo | `repetido en el archivo` | 9 (filas UNGRD triplicadas) |

Las filas sin fecha válida no se pueden guardar: se cuentan en el reporte como `rechazadosSinFecha`.

## 4. Construcción de atributos

| Atributo | Cómo se construye |
|---|---|
| `fecha_hora` (UTC) | SGC y USGS ya vienen en UTC, como verificó el barrido. DesInventar y UNGRD solo traen el día, que se interpreta como 00:00 en America/Bogota y se convierte a UTC (05:00). Se aceptan fechas ISO y día/mes/año |
| `departamento` | Se normaliza al nombre canónico: 49 variantes quedan en 32 departamentos |
| `municipio`, `latitud`, `longitud` | Se resuelven contra la DIVIPOLA del DANE: coincidencia exacta, sin espacios, contención de palabras ("Buga" → "Guadalajara de Buga"), similitud ≥ 0,85 para errores de tipeo y alias. Cubre el **99,97 %** de los sismos SGC |
| `precision_ubicacion` | Es `CENTROIDE_MUNICIPIO`, salvo que el archivo traiga coordenadas o el sismo cruce con USGS (±30 s, \|ΔM\| ≤ 0,5, ≤ 150 km). En ese caso es `EPICENTRO`: 261 sismos SGC |
| `zona` | Es el departamento. Los sismos de Santander con profundidad > 100 km van a "Nido de Bucaramanga" |
| `nivel_impacto` | Reglas en `Analytics/config/umbrales_impacto.json`: ALTO, MODERADO, BAJO o SIN_AFECTACION. Queda vacío si el registro no tiene datos de afectación |
| `clave_origen` | SHA-256 de `fuente\|id_evento\|municipio`. Hace las recargas idempotentes |
| Conteos | Un valor como 1.197 en una columna de conteo es un separador de miles mal leído, así que se convierte a 1197 |

## 5. Integración de fuentes

| Fuente | Cómo entra | Uso |
|---|---|---|
| Excel consolidado (SGC + DesInventar + UNGRD) | Carga del admin | Catálogo base y reportes de daño |
| USGS FDSN | Sincronización diaria (02:00) o "Sincronizar ahora" | Epicentros reales al cargar. Sismos M ≥ 2,5 **posteriores** al último dato del SGC, para la consulta y el mapa |
| UNGRD (datos.gov.co `2343-nuqp`) | Sincronización diaria | Reportes de daño por sismo de 2025 en adelante |

**Asociación de reportes UNGRD con su sismo.** La API de la UNGRD solo trae fecha y municipio. A cada reporte se le asigna el sismo de mayor magnitud (SGC o USGS, M ≥ 3, sin anomalías) ocurrido a ±1 día y a ≤ 150 km del municipio. De los 41 reportes únicos de 2025, 36 quedaron asociados; por ejemplo, el M6,4 del 8-jun-2025 aparece en varios municipios de Cundinamarca y Boyacá. Los 5 restantes quedan con `magnitud nula`.

**Limitación:** el umbral de 150 km es heurístico. Un sismo grande se siente más lejos, y algunos municipios afectados quedan asociados a un evento menor más cercano.

## 6. Resultado de la carga del Excel

| Fuente | Leídos | Válidos | Nuevos | Con epicentro | Con afectación |
|---|---|---|---|---|---|
| SGC | 98 884 | 98 460 | 98 884 | 261 | 0 |
| DesInventar | 1 010 | 396 | 1 009 | 0 | 1 005 |
| UNGRD | 38 | 24 | 30 | 0 | 38 |

Al cargar el mismo archivo por segunda vez: 0 nuevos y todos los registros como "existentes".

## 7. Datos que pasan al modelado

- **Análisis de frecuencia (fase 4):** registros SGC válidos con zona, hasta la **fecha de corte** (último dato del SGC). Los sismos USGS posteriores no entran, porque su completitud (M ≥ 2,5) no es comparable con la del SGC (Mc ≈ 1,9). Ver la decisión D9 en `docs/decisiones.md`.
- **Modelo de impacto (fase 5):** registros con `nivel_impacto` y con magnitud y profundidad (DesInventar, UNGRD y los reportes UNGRD de 2025), más la muestra SIN_AFECTACION del SGC (decisión D7).
