# Comprensión del negocio

> CRISP-DM fase 1 · Proyecto "Análisis y predicción de actividad sísmica en Colombia" — Universidad Cooperativa de Colombia, Analítica de Datos.

## 1. Contexto

Colombia está en el borde noroccidental de Suramérica, donde interactúan las placas de Nazca, Caribe y Suramericana. Eso produce sismicidad superficial a lo largo de los sistemas de fallas andinos, sismos de subducción en el Pacífico y una de las concentraciones de sismicidad intermedia más densas del mundo: el **Nido de Bucaramanga**. El Servicio Geológico Colombiano (SGC) registra miles de sismos al mes, la mayoría imperceptibles. Los reportes de daño los consolidan la UNGRD y DesInventar.

La información existe, pero está dispersa entre fuentes y formatos, y es difícil de interpretar para alguien que no es especialista. No hay una herramienta académica que responda en un solo lugar cuánto tiembla en una zona, si la actividad reciente es inusual y qué tan grave podría ser un sismo de cierta magnitud en un lugar dado.

## 2. Objetivos del negocio

1. **Centralizar** el catálogo sísmico y los reportes de daño en una base consultable, con filtros y visualización geográfica.
2. **Caracterizar estadísticamente** la sismicidad por zona: magnitud de completitud, relación Gutenberg-Richter, tasa anual y tendencia temporal.
3. **Detectar actividad anómala.** El sistema emite advertencias cuando la actividad reciente de una zona supera de forma estadísticamente significativa su comportamiento habitual.
4. **Estimar el nivel de impacto** probable de un sismo hipotético a partir de su magnitud, profundidad y ubicación.
5. **Divulgar** con una simulación física en un prototipo ESP32 que traduce una magnitud a señales de luz, vibración y sonido.

## 3. Criterios de éxito

| Tipo | Criterio | Cómo se mide |
|---|---|---|
| Analítico | El estimador de b recupera el valor real en datos sintéticos | b = 1,0 ± 0,05 en pruebas pytest |
| Analítico | Las tendencias se reportan con significancia | Mann-Kendall con α = 0,05, τ y pendiente de Sen por zona |
| Modelo | Clasificador de impacto mejor que el azar y balanceado | F1 macro en el conjunto de prueba, por encima de un baseline de clase mayoritaria; matriz de confusión publicada |
| Sistema | Las consultas responden con fluidez | Consultas paginadas < 1 s sobre ~100 000 registros |
| Sistema | La simulación física se confirma | ACK del ESP32 en < 5 s o estado FALLIDA |
| Comunicación | Ninguna vista sugiere que se predicen sismos | Aviso de alcance visible en toda vista con probabilidades o advertencias |

## 4. Alcance y limitaciones

**SismoCol no predice sismos.** Ningún método científico actual permite predecir la fecha, el lugar y la magnitud de un sismo. El sistema estima probabilidades de largo plazo (modelo de Poisson sobre Gutenberg-Richter) y señala desviaciones estadísticas de la actividad. Toda vista con probabilidades o advertencias muestra:

> "Una advertencia indica que la actividad reciente supera estadísticamente el comportamiento habitual de la zona. No es un pronóstico de sismo ni reemplaza los boletines oficiales del SGC."

Limitaciones conocidas desde el inicio (detalle en [02_comprension_datos.md](02_comprension_datos.md)):

- El catálogo instrumental disponible cubre de noviembre de 2022 a agosto de 2026, unos 3,8 años. Las tasas anuales y las tendencias tienen esa ventana como límite.
- La ubicación de la mayoría de los sismos es el centroide del municipio y no el epicentro. Solo los eventos que cruzan con USGS tienen epicentro real.
- Hay pocos reportes de daño etiquetables (~420 con magnitud y profundidad), así que el modelo de impacto es exploratorio.

## 5. Recursos

| Recurso | Detalle |
|---|---|
| Datos | `Sismos_Colombia_FINAL.xlsx` (SGC 2022–2026, DesInventar 1917–2017, UNGRD 2019–2022). APIs: USGS FDSN (epicentros), datos.gov.co / UNGRD `2343-nuqp` (emergencias recientes) y DIVIPOLA `gdxc-w37w` (centroides) |
| Software | Node.js 20, React 18, Python 3.11, MySQL 8, Mosquitto, PlatformIO |
| Hardware | ESP32, LEDs (verde, amarillo, rojo), motor de vibración, buzzer |
| Infraestructura | VPS Linux con Nginx y PM2, sin contenedores |

## 6. Traducción a objetivos de minería de datos

| Objetivo del negocio | Tarea analítica | Técnica |
|---|---|---|
| Caracterizar sismicidad | Estimación de parámetros | Mc por máxima curvatura; b de Aki-Utsu con error de Shi-Bolt; depuración de réplicas Gardner-Knopoff |
| Tendencia | Prueba de hipótesis sobre series de tiempo | Mann-Kendall con corrección por empates; pendiente de Sen |
| Actividad anómala | Prueba de hipótesis de conteos | Poisson: p = P(X ≥ k \| μ = λ_base · ventana) |
| Probabilidad de ocurrencia | Modelo probabilístico | P(M, t) = 1 − exp(−10^(a − bM) · t) |
| Nivel de impacto | Clasificación multiclase desbalanceada | Árbol de decisión, Random Forest y regresión logística multinomial con `class_weight="balanced"` y validación cruzada estratificada (F1 macro) |
