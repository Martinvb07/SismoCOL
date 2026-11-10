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

## D13 — Réplicas y catálogo para las estadísticas (2026-10-19)
Gardner-Knopoff solo marca `es_replica` entre sismos con **epicentro** (`precision_ubicacion = EPICENTRO`). Con el centroide del municipio (D2) muchos sismos quedan a 0 km entre sí y la ventana espacial pierde sentido: en pruebas con un catálogo sintético de b = 1, el Nido de Bucaramanga perdía más de la mitad de sus eventos como "réplicas" y b caía a 0,80.

Mc, Gutenberg-Richter, la tendencia, las probabilidades y las advertencias usan el **catálogo SGC completo**. Con eso b se recupera (0,998 en la misma prueba), y un enjambre o una secuencia de réplicas sí cuenta como actividad inusual, que es lo que la advertencia debe señalar. El análisis se recalcula después de cada carga, de cada sincronización y al cambiar la configuración. Cada recálculo guarda un lote nuevo en `analisis_zona` y `advertencia_actividad`, y la interfaz muestra el más reciente.

## D14 — Catálogo histórico USGS_HIST (2026-11-10)
Para las tasas de sismos grandes (periodos de retorno, mapa de amenaza) el catálogo del SGC es corto (nov-2022 a ago-2026). Se descarga del FDSN de USGS el catálogo M ≥ 4,5 desde 1973 en el rectángulo lat −4,5…13,5, lon −82…−66, una consulta por año, y se guarda como fuente `USGS_HIST`.
- No se mezcla con el SGC: `analisis.catalogo()` sigue filtrando `fuente = SGC`, y la consulta (`/api/sismos`, estadísticas, CSV) excluye `USGS_HIST` salvo que se pida con `fuente=USGS_HIST`.
- La zona se asigna con la lógica de la ingesta (municipio más cercano ≤ 60 km → `zona_de`). En la primera carga (3 937 eventos, 1973-01-05 a 2026-11-07) 2 111 quedaron sin zona: son eventos en el mar o en países vecinos. Se conservan para el mapa de amenaza, pero no entran en las tasas por zona.
- El rectángulo es algo más amplio que `BBOX_COLOMBIA`; para `USGS_HIST` la marca "fuera de Colombia" usa `BBOX_HISTORICO`.
- Limitación: las magnitudes son heterogéneas (82 % mb, el resto Mw/Ms/md), así que la completitud y b se estiman con esa mezcla.
- Se sincroniza desde Admin → Datos y modelo ("Sincronizar catálogo histórico"), con `POST /api/sincronizaciones/usgs-historico` o con `python -m sismocol.comandos usgs-historico [--desde AAAA]`. Es incremental desde el año del último evento y queda registrada en `carga_datos` (`origen = API`).

## D15 — Pronóstico de réplicas con Reasenberg-Jones (2026-11-10)
Para cada sismo principal con M ≥ 6 (`REPLICAS_MAGNITUD_MIN`) del catálogo instrumental (SGC más USGS posterior al corte, como en D9) se ajusta el modelo de Reasenberg y Jones (1989): λ(t, M) = 10^(a + b(Mm − M)) (t + c)^(−p).
- **Principales:** se recorren de mayor a menor magnitud. Un sismo dentro de la ventana de Gardner-Knopoff de otro mayor, o su precursor (hasta 1 día antes y dentro de la ventana espacial), no es principal aparte.
- **Réplicas:** sismos posteriores de magnitud ≤ Mm dentro de la ventana de Gardner-Knopoff. A diferencia de D13, aquí sí entran los sismos con centroide municipal: para M ≥ 6 la ventana espacial mide ≥ 54 km, mucho más que el error del centroide.
- **Ajuste:** p y c por máxima verosimilitud (proceso de Poisson no homogéneo, Ogata 1983), con K en forma cerrada. b sale por Aki-Utsu si hay ≥ 30 réplicas ≥ Mc. Con 3 a 9 réplicas solo se estima la productividad `a` y se usan b, p y c genéricos (Reasenberg y Jones 1994). Con menos de 3 réplicas se usan los genéricos completos (a = −1,67, b = 0,91, p = 1,08, c = 0,05 días, de California). No hay valores genéricos publicados para Colombia.
- **Salidas:** P(≥1) y N esperado para M ≥ 4, 5 y 6 en 24 h, 7 d y 30 d desde el último dato. El IC 95 % combina 4 000 simulaciones de los parámetros (covarianza asintótica del MLE y error de b) con la variabilidad de Poisson. La semilla es fija para que el cálculo sea reproducible.
- **Validación retrospectiva:** se ajusta con las primeras 24 h, 72 h y 7 días y se compara con lo observado después. Se reporta la fracción de casos dentro del IC 95 %, el error absoluto medio y la log-verosimilitud, junto con los mismos valores para los parámetros genéricos como referencia. Si los datos no cubren todo el horizonte, se compara solo la parte cubierta (`cobertura`).
- **Persistencia:** cada cálculo guarda una fila en `pronostico_replicas` con los parámetros, la ventana, las fuentes y el periodo de los datos.
- **Limitaciones:**
  - El catálogo del SGC termina el 26-ago-2026, 16 días después del sismo de Chocó (M 7,4, 10-ago-2026, 116 km de profundidad). Lo posterior viene de USGS M ≥ 2,5, cuya completitud es menor; por eso las ventanas de 30 días mezclan fuentes.
  - Los sismos de profundidad intermedia suelen tener pocas réplicas.
  - Un enjambre dentro de la ventana, como el de mediados de septiembre de 2026 cerca de Chocó (≈ 50–70 km de profundidad), no sigue Omori. Cuando p o c llegan a su límite, el ajuste lo advierte.

## D16 — Pronóstico de la actividad mensual por zona (2026-11-10)
Para cada zona con análisis propio (no agrupada en su región) se pronostica el número de sismos M ≥ Mc de la zona por mes durante los próximos 12 meses. Se usa solo el catálogo SGC, como en D9.
- **Serie:** conteo mensual en hora de Colombia, solo con meses completos. El primer mes (nov-2022 desde el día 10) y el último (ago-2026 hasta el día 26) se descartan; quedan unos 44 meses (dic-2022 a jul-2026). Por eso el pronóstico empieza en ago-2026.
- **Modelos:**
  - SARIMA (statsmodels) sobre log(1 + conteo). El orden sale de la rejilla (p,d,q) ∈ {(0,0,0), (1,0,0), (2,0,0), (1,0,1), (0,1,1), (1,1,1)} × estacional {(0,0,0,0), (1,0,0,12)}. Se elige por AIC usando solo los primeros 24 meses (antes del primer origen del backtesting), para no filtrar información del periodo evaluado.
  - Ingenuo (último mes).
  - Media móvil de 12 meses.
- **Backtesting por origen móvil:** se entrena hasta el mes t (t ≥ 24) y se pronostican t+1..t+3. Se reportan MAE y MAPE; el MAPE excluye los meses con 0 eventos. En la vista se muestra el modelo de menor MAE de cada zona. Las métricas de los tres modelos se guardan en `backtesting_pronostico`.
- **Bandas del 80 y el 95 %:**
  - SARIMA: los cuantiles en escala log se transforman con expm1, así que el valor central es la mediana, no la media.
  - Modelos base: cuantiles de los errores a un paso del backtesting. Para el ingenuo crecen con √h y para la media móvil se mantienen. Es una aproximación.
- **Limitaciones:**
  - Con unos 44 meses, la componente estacional de 12 meses se estima con apenas 3 ciclos.
  - El conteo incluye réplicas (D13), así que una secuencia grande infla los meses siguientes y el ingenuo puede salir favorecido o castigado.
  - Si un modelo base gana a SARIMA en una zona, se reporta así.

## D17 — Periodo de retorno y mapa de amenaza (2026-11-10)
Se calculan con el catálogo histórico `USGS_HIST` (D14), no con el SGC, cuyo periodo de casi 4 años es muy corto para sismos grandes.
- **Depuración:** Gardner-Knopoff sobre todo el catálogo, ya que todos los eventos tienen epicentro. Poisson supone eventos independientes. En la primera carga quedaron 2 334 de 3 937 eventos.
- **Completitud:** Mc por máxima curvatura del catálogo depurado: 4,7. La completitud por década (guardada en los parámetros) da 4,9 en los años 70 y 80 y 4,7 desde los 90. Se usa Mc = 4,7 en todo el periodo; los años 70–80 pueden estar algo incompletos entre 4,7 y 4,9, lo que subestimaría levemente las tasas.
- **Gutenberg-Richter por zona:** b por Aki-Utsu y a anual = log10(N/T) + b·Mc. Las zonas con menos de 30 eventos ≥ Mc usan todos los eventos de su región natural, así que todas las zonas de una región muestran la tasa de la región entera, no la propia.
- **Periodo de retorno y probabilidades:** Tr = 1/λ(M) para M 5, 6 y 7, con un rango que sale de b ± σb manteniendo la tasa en Mc. P = 1 − e^(−λt) para 30 días y 1, 5, 10 y 50 años. Se marca `extrapolado` cuando M supera la máxima observada en la zona.
- **Mapa de amenaza:** sismicidad suavizada de Frankel (1995):
  - conteos ≥ Mc en celdas de 0,5° dentro del rectángulo histórico;
  - kernel gaussiano con c = 50 km, truncado en 3c;
  - tasa de M ≥ 5 con el b regional;
  - P(M ≥ 5 en 10 años) por celda.
- **Mezcla de magnitudes:** las magnitudes son heterogéneas (sobre todo mb, que se satura cerca de M 6), así que las tasas de M 6–7 dependen de la extrapolación de Gutenberg-Richter.
- **Alcance:** son tasas medias de largo plazo, no pronósticos de fecha ni de lugar, y no reemplazan el Estudio General de Amenaza Sísmica del SGC.

## D18 — Modelo de impacto con intensidad, población y vulnerabilidad (2026-11-10)
Reemplaza en parte a D7 (construcción de los ejemplos) y amplía las variables del modelo de impacto.
- **Epicentro de los reportes de daño.** Antes, la ubicación de un reporte era el centroide de su municipio y la distancia epicentro-municipio era ≈ 0 en todos los ejemplos. Ahora cada reporte de DesInventar/UNGRD se asocia al sismo instrumental con epicentro (SGC con `EPICENTRO`, USGS o USGS_HIST) que cumpla:
  - ±1 día del día local del reporte;
  - ≤ 150 km del municipio;
  - |ΔM| ≤ 0,6, eligiendo la menor |ΔM| y luego la mayor M.

  Se conservan la magnitud y la profundidad del reporte y se toma el epicentro del sismo. Los reportes sin pareja, como casi todos los anteriores a 1973, usan el centroide y quedan marcados.
- **SIN_AFECTACION:** se mantiene el total (2 por cada reporte con daño), pero ahora sale de dos fuentes:
  - la mitad son **controles del mismo evento**: municipios a ≤ 150 km del epicentro de un sismo con reportes que no reportaron daño en ese evento, para que el modelo aprenda la atenuación con la distancia;
  - el resto son sismos SGC M ≥ 3,5 sin reporte, como en D7.

  Sigue siendo una suposición: la ausencia de reporte no garantiza la ausencia de daño.
- **Variables nuevas:**
  - distancia hipocentral entre el epicentro y la cabecera DIVIPOLA;
  - MMI estimada con Allen, Wald y Worden (2012), versión hipocentral (`sismocol/intensidad.py`, coeficientes de la implementación de referencia de OpenQuake 3.26.2);
  - log10 de la población municipal 2018 y % urbano (DANE, PPED 2018-2042, año 2018);
  - % de hogares con carencia por material de paredes (anexo del déficit habitacional CNPV 2018, nueva metodología).
  - Los municipios sin dato toman la mediana nacional, con aviso.
  - **Falta la densidad (hab/km²):** el área municipal (MGN del DANE) no se pudo descargar de una fuente accesible y no se inventó. El % urbano la sustituye en parte.
- **Comparación:** validación cruzada estratificada de 5 pliegues, los mismos para todos, con predicciones fuera de pliegue. Modelos:
  - Random Forest actual con 4 variables;
  - Random Forest con las variables nuevas;
  - LightGBM con las variables nuevas;
  - un ordinal de Frank y Hall (2001) con LightGBM;
  - el baseline de clase mayoritaria.

  Métricas: F1 macro, F1 por clase, exactitud, matriz de confusión y Brier multiclase. Las etiquetas se codifican 0–3 en orden de severidad para que la calibración y el ordinal conserven el orden. El mejor por F1 macro se elige con los mismos pliegues; esa selección introduce un leve sesgo optimista.
- **Calibración:** `CalibratedClassifierCV`, isotónica con ≥ 1 000 ejemplos y sigmoide si hay menos. Se reportan el Brier y las curvas de confiabilidad, uno contra resto por clase, antes y después de calibrar. Se despliega la versión calibrada salvo que su F1 macro caiga más de 0,01, porque con pocos datos la calibración puede cambiar el argmax. La decisión queda en el reporte.
- **SHAP:** TreeExplainer (Random Forest y LightGBM) o PermutationExplainer (ordinal) sobre el modelo sin calibrar. La importancia global (media de |SHAP|) se muestra al administrador, y la contribución de cada variable a la clase predicha, en cada predicción.
- **Activación:** el modelo nuevo solo se activa si su F1 macro supera al del modelo vigente reentrenado y evaluado con los mismos pliegues; si no se puede reevaluar, se compara con el F1 registrado. Antes un modelo nuevo solo se activaba solo si no había ninguno activo.
- **Predicción:** se evalúa en el municipio más cercano al punto. El simulador de escenarios evalúa todos los municipios con MMI ≥ III a ≤ 300 km del epicentro, que es el límite de validez de la ecuación.
- **Limitaciones:**
  - La ecuación de intensidad es para corteza activa somera, Mw 5–7,9; aquí se aplica también a sismos intermedios y a magnitudes mezcladas (ML, mb, Mw).
  - La población es la de 2018 incluso para reportes antiguos.
  - El indicador de vivienda es por hogares, no por viviendas.
  - El número de reportes con daño ALTO es pequeño.

## D19 — Informe de resultados generado desde la base (2026-11-10)
`docs/resultados_analitica.md` no se escribe a mano: lo genera `python -m eda.resultados_analitica` con lo que guardaron los cálculos (`pronostico_replicas`, `pronostico_actividad`, `backtesting_pronostico`, `calculo_amenaza`, `periodo_retorno`, `modelo_predictivo`). Así cada número se puede rastrear hasta su cálculo, con sus parámetros y su periodo.
- Si falta una fuente (SGC o DesInventar), el informe lo dice y deja la sección como pendiente en lugar de mostrar valores.
- La versión versionada del 2026-11-10 se generó en un entorno sin el Excel del SGC ni DesInventar, solo con datos públicos descargados (USGS histórico, USGS 2026 y UNGRD). Por eso las secciones 3 (pronóstico mensual) y 5 (modelo de impacto) quedaron pendientes y la validación de réplicas usa solo eventos USGS M ≥ 2,5.
- En el servidor, con todos los datos cargados, hay que regenerarlo; la validación de réplicas con el SGC dará números distintos, porque su completitud es mayor.

## D20 — Pronóstico de réplicas para cualquier sismo (2026-11-10)
Además de los principales M ≥ 6 que se recalculan y guardan (D15), `GET /api/replicas/sismo/:id` da el pronóstico de cualquier sismo del SGC o de USGS con M ≥ 4.
- **Cálculo:** con la misma lógica que el recálculo: máxima verosimilitud si hay ≥ 10 réplicas, genérico con `a` de la secuencia si hay de 3 a 9, y genérico de Reasenberg y Jones (1989) si hay menos. Siempre parte del último dato disponible.
- **Caché:** si el sismo ya tiene un pronóstico guardado, se devuelve ese. Si no, se calcula al vuelo y no se guarda en la base. Si el cálculo tarda más de 2 s, se guarda en memoria con la clave (sismo, fecha del último dato), así que se invalida solo cuando llegan datos nuevos.
- **Advertencia en texto simple** cuando el método es genérico, o cuando el sismo cae en la ventana de Gardner-Knopoff de uno mayor anterior (podría ser su réplica y sus réplicas se mezclan).
- **Frontend:** la vista de réplicas busca sismos por fecha, departamento, municipio y magnitud mínima (`/api/sismos?instrumental=true`) y se abre con `?sismo=id`. Consulta enlaza «Ver réplicas» desde la tabla y desde el clic en el mapa. La validación retrospectiva (`POST /api/replicas/:id/validar`) sirve para cualquier sismo.

## D21 — Analítica en palabras simples (2026-11-10)
Cada vista de analítica (Réplicas, Análisis y sus pestañas de pronóstico y amenaza, Predicción y Simulador) empieza con una tarjeta **«En palabras simples»**: una o dos frases generadas a partir de los datos (`Frontend/src/lib/resumenes.ts`), sin siglas.
- **Semáforo:** junto a cada frase hay un semáforo bajo / moderado / alto, con color y texto. Sus umbrales están en un solo archivo, `Frontend/src/umbralesSemaforo.ts`, y el tooltip explica el criterio con esos mismos números:
  - réplicas: P(≥ 1 réplica M ≥ 5 en 7 días), umbrales 10 % y 30 %;
  - actividad por zona: primer mes pronosticado frente al promedio de los últimos 12 meses, umbrales 1,0 y 1,3;
  - amenaza: P(M ≥ 6 en 10 años), umbrales 10 % y 50 %;
  - impacto y advertencias: por su categoría.
- **Detalle técnico plegable:** las tablas técnicas (intervalos, p/c/b, MAE/MAPE, backtesting, SHAP, Mann-Kendall, Gutenberg-Richter, periodos de retorno con su rango y la validación retrospectiva de réplicas) van dentro de «Ver detalle técnico», cerrado por defecto.
- **Glosario:** cada término técnico lleva un ícono (i) con su explicación en una frase, tomada de `Frontend/src/lib/glosario.ts`. El tooltip se dibuja en un portal y se ajusta al ancho de la pantalla.
- **Gráficas:** el título dice la conclusión (por ejemplo, «Las réplicas disminuyen rápido después del sismo»), los ejes tienen unidades en español y las leyendas no usan siglas.
- **Panel principal:** «¿Qué dice SismoCol hoy?» resume las zonas con advertencia, el último sismo fuerte con su probabilidad de réplicas a 7 días, la zona con mayor P(M ≥ 6 en 10 años) y los sismos esperados en todo el país. Para esto último, el pronóstico mensual (D16) calcula además la serie `Colombia` con todo el catálogo SGC.
- **Avisos:** el aviso de alcance (RNF12) usa ahora palabras simples: «Esto es una estimación con datos históricos; no predice cuándo ni dónde ocurrirá un sismo».

## D22 — Réplicas para todos los sismos del registro (2026-11-10)
Cambia D20: el pronóstico al vuelo ya no exige M ≥ 4. Cualquier sismo del SGC o de USGS con magnitud se puede consultar; el mínimo queda configurable con `REPLICAS_MAGNITUD_MIN_CONSULTA` (por defecto 0).
- Para los sismos de magnitud menor que 4 el cálculo cae casi siempre en el genérico y da probabilidades muy bajas (un M 3 tiene cerca de 1,4 % de probabilidad de una réplica de magnitud 4 o más en 7 días). La respuesta lo dice en texto simple: «Este sismo es pequeño: los sismos de esta magnitud casi nunca producen réplicas que se sientan».
- La vista de réplicas empieza con «Elige un sismo»: los sismos fuertes destacados y debajo el listado paginado de **todos** los sismos, con filtros opcionales. Al elegir uno, la página baja hasta su pronóstico.
