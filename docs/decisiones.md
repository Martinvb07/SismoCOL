# Decisiones técnicas

Registro de decisiones que se apartan del planteamiento original o que no son obvias. La más reciente va al final.

## D1 — Estructura y despliegue sin Docker (2026-10-05)
Se sigue la estructura de ReservaTuCancha: carpetas independientes `Backend/`, `Frontend/`, `Analytics/` y `Firmware/`, cada una con su `package.json` (npm) o `requirements.txt` (venv). No hay pnpm workspaces. En producción, MySQL y Mosquitto se instalan nativos en el VPS; PM2 corre la API y el servicio analítico (`ecosystem.config.js`), y Nginx sirve el build estático del frontend.

## D2 — Coordenadas: centroide municipal + epicentro USGS (2026-10-05)
El Excel no trae latitud ni longitud, y el FDSN del SGC no responde (404). Se hace así:
1. Cada registro recibe el centroide de su municipio según DIVIPOLA (datos.gov.co `gdxc-w37w`), con `precision_ubicacion = CENTROIDE_MUNICIPIO`.
2. Si el sismo cruza con un evento del FDSN de USGS (±30 s, |ΔM| ≤ 0,5, dentro del bbox), se usa el epicentro de USGS con `precision_ubicacion = EPICENTRO`.

La depuración de réplicas con Gardner-Knopoff usa estas coordenadas. Para M < 3 la ventana espacial L(M) ≥ 19 km es comparable al error del centroide, así que el efecto es acotado y queda documentado como limitación.

## D3 — Zona horaria (2026-10-05)
El barrido confirmó que las fechas del tramo SGC están en **UTC**: 312 de 676 eventos M ≥ 3,5 coinciden con USGS a ±30 s, contra 1 si se leen como hora local. Las fechas de los reportes de daño no tienen hora y se interpretan como 00:00 hora de Colombia. En MySQL todo se guarda en UTC, y la presentación y las ventanas de advertencia usan America/Bogota.

## D4 — Cambios al modelo de datos (2026-10-05)
- `registro_sismico`:
  - Se agregan `id_evento_origen`, `clave_origen` (SHA-256 único de `fuente|id|municipio`, para recargas idempotentes), `precision_ubicacion`, `tipo_magnitud` y `zona`.
  - `magnitud`, `profundidad_km`, `latitud` y `longitud` pasan a ser nullables. Así los anómalos se conservan marcados en vez de descartarse.
- `afectacion`: se agregan `desaparecidos` y `damnificados`.
- `carga_datos`: se agrega `origen` (ARCHIVO | API), y `id_usuario` pasa a ser nullable porque las sincronizaciones automáticas no tienen usuario.
- Enum `fuente`: se agrega `USGS`.
- `analisis_zona`: se agrega `agrupada_en`, la región usada cuando la zona no alcanza `min_eventos_zona`.

## D5 — Zona Nido de Bucaramanga (2026-10-05)
Los sismos de Santander con profundidad > 100 km forman la zona "Nido de Bucaramanga" (48 804 eventos, el 49 % del catálogo). El resto de Santander sigue siendo la zona "Santander".

## D6 — Integración con APIs oficiales (2026-10-05)
Un job diario de APScheduler en Analytics:
- trae los eventos nuevos de USGS FDSN;
- trae los reportes `SISMO` de UNGRD desde datos.gov.co (`2343-nuqp`, API Socrata);
- registra la carga en `carga_datos` con `origen = API`;
- dispara el recálculo.

El admin también puede lanzarlo con "Sincronizar ahora" y sigue pudiendo subir archivos CSV o XLSX a mano. Si el FDSN del SGC vuelve a funcionar, se agrega como fuente prioritaria.

## D7 — Clase SIN_AFECTACION del modelo de impacto (2026-10-05)
Los ejemplos de entrenamiento salen de los reportes de daño de DesInventar y UNGRD, cada uno como impacto de un sismo en un municipio. A eso se suma una muestra de sismos SGC con M ≥ 3,5 sin reporte UNGRD en su municipio y fecha, etiquetada SIN_AFECTACION. Es una suposición: ausencia de reporte ≠ ausencia de daño garantizada. Se documenta en el reporte de evaluación.

## D8 — Versiones de librerías (2026-10-05)
- Prisma 7.10 (estable), que usa el driver adapter `@prisma/adapter-mariadb` para MySQL y `prisma.config.ts`. La 8.x sigue en RC.
- TypeScript 5.9.
- Express 5 y Zod 4.

`npm audit` reporta vulnerabilidades en `mysql2`, que es una dependencia **solo del CLI de Prisma** (desarrollo/migraciones) y no se carga en el runtime de la API. Se revisa al actualizar Prisma.

## D9 — Fecha de corte del análisis (2026-10-05)
El SGC no publica un servicio de eventos accesible: su FDSN responde 404, y sus feeds y su portal devuelven 403. El catálogo disponible termina el 26-ago-2026. Mc, Gutenberg-Richter, la tendencia, las probabilidades y las advertencias se calculan **solo con el catálogo SGC**, con fecha de corte en su último evento, y la interfaz muestra "Datos hasta …". Los sismos posteriores de USGS (M ≥ 2,5) se muestran en la consulta y el mapa, pero no entran en las estadísticas, porque su completitud no es comparable con la del SGC y sesgaría b y las tasas. Cuando el admin carga un CSV más reciente del SGC, la fecha de corte avanza sola.

## D10 — Centros educativos y de salud (2026-10-05)
Se agregan `afectacion.centros_educativos` y `afectacion.centros_salud` (183 y 62 reportes con valor > 0). No entran en las reglas de `nivel_impacto`. Se descartan reubicados, evacuados, pérdidas en USD y daños en vías, que tienen menos de 25 valores distintos de cero.

## D11 — Reportes UNGRD sin magnitud (2026-10-05)
La API de la UNGRD no informa magnitud ni profundidad. Se asocia cada reporte al sismo de mayor magnitud a ±1 día y ≤ 150 km del municipio (ver `docs/crisp-dm/03_preparacion_datos.md` §5). El ID de un reporte UNGRD es `fecha-códigoDIVIPOLA`, porque la fuente no publica un ID de evento y la columna `ID_Evento` del Excel trae el código del municipio.

## D12 — Dispositivos visibles para USUARIO (2026-10-05)
`GET /api/dispositivos/estado` se abre a USUARIO en modo solo lectura, porque la pantalla de simulación necesita mostrar si el ESP32 está en línea. La gestión de dispositivos sigue siendo solo para ADMIN.
