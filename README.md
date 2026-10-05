<h1 align="center">SismoCol</h1>

<p align="center">Análisis de frecuencia, advertencias de actividad y estimación de impacto sísmico en Colombia.</p>

<p align="center">Proyecto universitario — Universidad Cooperativa de Colombia · Analítica de Datos · Metodología CRISP-DM</p>

---

> **SismoCol no predice sismos.** Una advertencia indica que la actividad reciente supera estadísticamente el comportamiento habitual de la zona. No es un pronóstico de sismo ni reemplaza los boletines oficiales del SGC.

## Qué hace

- **Consulta de sismos**: filtros por fecha, departamento, magnitud y profundidad; mapa, histograma y exportación a CSV.
- **Análisis de frecuencia por zona**:
  - magnitud de completitud;
  - Gutenberg-Richter (a, b ± σb);
  - tendencia (Mann-Kendall + pendiente de Sen);
  - probabilidad de ocurrencia (Poisson);
  - advertencias de actividad elevada.
- **Estimación del nivel de impacto** de un sismo hipotético con un modelo de clasificación.
- **Simulación física**: la magnitud elegida se envía por MQTT a un ESP32 con LEDs, vibración y alarma.
- **Administración**: carga de datasets, sincronización con USGS y UNGRD, versiones del modelo, parámetros y usuarios.

## Estructura

```
SismoCOL/
├── Backend/            API — Node 20, Express 5, TypeScript, Prisma 7, Zod, JWT
├── Frontend/           React 18 + Vite + Tailwind + D3
├── Analytics/          Servicio analítico — Python 3.11, FastAPI, scikit-learn, APScheduler
│   ├── sismocol/       Módulos de análisis
│   └── eda/            Barrido de datos (CRISP-DM)
├── Firmware/esp32/     PlatformIO (Arduino)
├── infra/              Mosquitto y Nginx de ejemplo
├── docs/
│   ├── crisp-dm/       Un documento por fase CRISP-DM
│   └── decisiones.md   Decisiones técnicas
├── data/               raw/ (Excel) y ref/ (DIVIPOLA, USGS): no se versionan
└── ecosystem.config.js Procesos PM2 en el VPS
```

No se usa Docker. En desarrollo y en el VPS, MySQL 8 y Mosquitto se instalan nativos.

## Requisitos

- Node.js ≥ 20 y npm
- Python 3.11
- MySQL 8
- Mosquitto 2, a partir de la fase 6

## Puesta en marcha (desarrollo)

### 1. Base de datos

En MySQL, con un usuario administrador:

```sql
CREATE DATABASE sismocol CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE sismocol_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sismocol'@'localhost' IDENTIFIED BY 'una-clave-segura';
GRANT ALL PRIVILEGES ON sismocol.* TO 'sismocol'@'localhost';
GRANT ALL PRIVILEGES ON sismocol_shadow.* TO 'sismocol'@'localhost';
FLUSH PRIVILEGES;
```

`sismocol_shadow` solo la usa `prisma migrate dev` en desarrollo. En producción no hace falta.

### 2. API

```bash
cd Backend
cp .env.example .env      # completar DATABASE_URL, JWT_SECRET, ANALYTICS_TOKEN y SEED_*
npm run secreto           # genera un valor para JWT_SECRET / ANALYTICS_TOKEN
npm install               # también genera el cliente de Prisma
npm run db:migrate        # aplica las migraciones
npm run db:seed           # admin, usuario de prueba, ESP32 y configuración por defecto
npm run dev               # http://localhost:4000/api/health
```

### 3. Servicio analítico y barrido de datos

Ver [Analytics/README.md](Analytics/README.md). El Excel va en `data/raw/Sismos_Colombia_FINAL.xlsx`.

## Metodología

El proyecto sigue CRISP-DM. Cada fase tiene su documento en [docs/crisp-dm](docs/crisp-dm/README.md).

| Fase de desarrollo | Contenido | CRISP-DM |
|---|---|---|
| 1. Base | Estructura, modelo de datos, seed, barrido de datos | Comprensión del negocio y de los datos |
| 2. Datos | Ingesta, limpieza, coordenadas, sincronización con APIs, carga admin | Preparación de los datos |
| 3. Consulta | Autenticación, mapa, histograma, tabla | Despliegue (parcial) |
| 4. Análisis de frecuencia | Mc, Gutenberg-Richter, tendencia, advertencias | Modelado y evaluación |
| 5. Modelo de impacto | Entrenamiento, versiones, predicción | Modelado y evaluación |
| 6. Simulación | MQTT, ESP32 | Despliegue |
| 7. Cierre | Pruebas, seguridad, Nginx, guía de VPS con PM2 | Despliegue |

## Fuentes de datos

- **SGC**: catálogo sísmico 2022–2026, incluido en el Excel consolidado.
- **DesInventar y UNGRD**: reportes de daño 1917–2022. Los reportes recientes se traen de la API de datos.gov.co (`2343-nuqp`).
- **USGS FDSN**: epicentros de los sismos con M ≥ 2,5.
- **DANE DIVIPOLA**: centroides de municipios (datos.gov.co `gdxc-w37w`).
