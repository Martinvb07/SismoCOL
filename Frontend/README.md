# Frontend — SismoCol

React 18 + Vite + TypeScript (estricto) + Tailwind CSS + React Router + TanStack Query. Las gráficas se hacen solo con D3 (`d3-scale`, `d3-axis`, `d3-shape`, `d3-geo`, `d3-array`, `d3-format`, `d3-selection`). Los formularios usan react-hook-form + Zod.

El cliente se programa contra [`docs/api-contrato.md`](../docs/api-contrato.md). Mientras el backend no esté listo, se usan datos simulados con MSW.

## Requisitos

- Node.js ≥ 20 y npm

## Instalación y uso

```bash
cd Frontend
npm install
npm run dev        # http://localhost:5173 (con datos simulados por defecto)
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo de Vite |
| `npm run build` | Compila TypeScript y genera `dist/` (lo sirve Nginx en producción) |
| `npm run preview` | Sirve `dist/` localmente |
| `npm run typecheck` | `tsc --noEmit` sobre la app y la configuración |
| `npm run lint` | ESLint (reglas de TypeScript con tipos y de react-hooks) |
| `npm test` | Vitest + Testing Library |

## Variables de entorno

Se leen de `.env.development` (desarrollo), `.env.production` o `.env.local`. Ver `.env.example`.

| Variable | Por defecto | Descripción |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000` | URL base de la API, sin `/api`. Vacía = mismo origen (Nginx con proxy a `/api`). |
| `VITE_USAR_MOCKS` | `false` (`true` en `.env.development`) | `true` activa MSW en el navegador y no se llama a la API real. |

`.env.development` se versiona porque solo tiene banderas públicas (sin secretos).

## Datos simulados (MSW)

Con `VITE_USAR_MOCKS=true`, `src/main.tsx` arranca el service worker de MSW (`public/mockServiceWorker.js`) antes de montar la app. Los handlers (`src/mocks/handlers.ts`) respetan el contrato: mismas rutas, tipos, paginación, códigos 400/401/403/404/409/422/429/503 y formato `{ error, detalles }`.

- Usuarios: `admin@sismocol.local` (ADMIN) y `usuario@sismocol.local` (USUARIO), con **cualquier contraseña de 10 o más caracteres**.
- ~4 300 sismos generados de forma determinista (semilla fija): Nido de Bucaramanga (~49 %, profundidad ~145 km), Meta, Chocó, Huila, Antioquia, etc.; magnitudes con distribución Gutenberg-Richter (b ≈ 1), eventos notables (Paratebueno M 6,1/6,3), reportes de daño de DesInventar/UNGRD y registros anómalos marcados.
- Mann-Kendall, pendiente de Sen, Mc, Gutenberg-Richter (Aki-Utsu, Shi-Bolt) y probabilidades de Poisson se calculan de verdad sobre esos datos (`src/mocks/calculos.ts`).
- El estado (usuarios, modelos, simulaciones, cargas, configuración) vive en memoria y se reinicia al recargar.

Para usar el backend real: `VITE_USAR_MOCKS=false` y `VITE_API_URL` apuntando a la API.

## Estructura

```
Frontend/
├── public/
│   ├── geo/colombia-departamentos.json   GeoJSON de departamentos (fuente y licencia en FUENTE.md)
│   └── mockServiceWorker.js              Worker de MSW (generado por `msw init`)
├── src/
│   ├── api/            tipos.ts (contrato), cliente.ts (fetch tipado, errores, 401), endpoints.ts (rutas y claves de consulta)
│   ├── auth/           Sesión en sessionStorage, contexto, rutas protegidas por rol
│   ├── componentes/
│   │   ├── layout/     Menú lateral (colapsable en tableta), barra superior, navegación por rol
│   │   └── ui/         Tarjeta, botones, insignias, alertas, estados de carga/vacío/error, formularios, modal, paginación
│   ├── graficas/       Componentes D3: MapaColombia, HistogramaMagnitud, SerieMensual, GraficaGutenbergRichter, BarrasProbabilidad
│   ├── hooks/          useDimensiones (ResizeObserver)
│   ├── lib/            Formato es-CO / America/Bogota, escalas de color, cálculos (recta GR, Sen, LEDs), esquemas Zod
│   ├── mocks/          Datos simulados y handlers MSW
│   ├── paginas/        Login, Consulta, Análisis, Predicción, Simulación y admin/ (Panel, Datos y modelo, Configuración, Usuarios)
│   └── test/           Configuración de Vitest, pruebas de formularios y prueba de humo de pantallas
├── tailwind.config.ts  Tokens de color (lateral #14323b, fondo #f3f5f7, primario #1f8fa6)
└── vite.config.ts      Vite + configuración de Vitest
```

## Convenciones

- Fechas: llegan en UTC y se muestran en `America/Bogota` con `Intl.DateTimeFormat('es-CO')`. Números con coma decimal (`src/lib/formato.ts`).
- Verde/amarillo/rojo se usan **solo** para magnitud, nivel de impacto y advertencias; todo sale de `src/lib/escalasColor.ts` y siempre va acompañado de texto.
- El token se guarda en `sessionStorage`. Ante un 401 el cliente cierra la sesión y redirige a `/login`.
- Toda vista con probabilidades o advertencias muestra el aviso de alcance del contrato y "Datos hasta …".
- Cada gráfica se redibuja al cambiar los datos o el tamaño del contenedor y tiene tooltip.
