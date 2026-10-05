# Contrato de la API REST

Es la fuente de verdad entre `Frontend/` y `Backend/`. Si algo cambia, se actualiza aquí primero.

## Convenciones

- Base: `/api`. JSON en UTF-8. Los campos van en camelCase.
- Autenticación: `Authorization: Bearer <token JWT>`. Sin token o con token vencido la respuesta es **401**; con un rol insuficiente es **403**.
- Fechas: ISO 8601 en **UTC** (`2026-08-10T12:34:28.000Z`). El frontend las muestra en `America/Bogota`.
- Los decimales llegan como `number` y los opcionales como `null`, nunca ausentes.
- Paginación: los parámetros son `pagina` (desde 1) y `tamano` (por defecto 25, máximo 100). La respuesta tiene esta forma:
  ```json
  { "datos": [], "total": 0, "pagina": 1, "tamano": 25 }
  ```
- Errores:
  ```json
  { "error": "Mensaje para el usuario", "detalles": [{ "campo": "magnitud", "mensaje": "Debe estar entre 2 y 8" }] }
  ```
  Los códigos son 400 (validación), 401, 403, 404, 409 (conflicto), 422 (archivo rechazado), 429 (rate limit), 500 y 502/503 (el servicio analítico no responde).

## Tipos compartidos

```ts
type Rol = 'ADMIN' | 'USUARIO';
type Fuente = 'SGC' | 'UNGRD' | 'DESINVENTAR' | 'USGS';
type NivelImpacto = 'SIN_AFECTACION' | 'BAJO' | 'MODERADO' | 'ALTO';
type NivelAdvertencia = 'NORMAL' | 'ELEVADA' | 'ALTA';
type PrecisionUbicacion = 'EPICENTRO' | 'CENTROIDE_MUNICIPIO';

interface Usuario { idUsuario: number; nombre: string; correo: string; rol: Rol; activo: boolean; fechaCreacion: string }

interface Sismo {
  idSismo: number; fechaHora: string; latitud: number | null; longitud: number | null;
  precisionUbicacion: PrecisionUbicacion | null; profundidadKm: number | null; magnitud: number | null;
  departamento: string | null; municipio: string | null; zona: string | null; fuente: Fuente;
  nivelImpacto: NivelImpacto | null; esReplica: boolean; esAnomalo: boolean; motivoAnomalia: string | null;
}

interface Carga {
  idCarga: number; origen: 'ARCHIVO' | 'API'; fuente: Fuente; nombreArchivo: string;
  registrosLeidos: number; registrosValidos: number; estado: 'PROCESADO' | 'RECHAZADO';
  fechaCarga: string; usuario: { idUsuario: number; nombre: string } | null;
}

interface ReporteCarga {
  leidos: number; validos: number; rechazadosSinFecha: number;
  mapeo: Record<string, string>;          // campo SismoCol → columna del archivo
  columnasIgnoradas: string[];
  porFuente: Array<{
    fuente: Fuente; leidos: number; validos: number; nuevos: number; existentes: number;
    porMotivo: Record<string, number>;    // "profundidad negativa": 366, …
    conEpicentro: number; conCentroide: number; conAfectacion: number;
  }>;
}

interface ModeloPredictivo {
  idModelo: number; version: string; algoritmo: string; exactitud: number; f1Macro: number;
  activo: boolean; fechaEntrenamiento: string;
}

interface Dispositivo {
  idDispositivo: number; nombre: string; topicoMqtt: string;
  estado: 'EN_LINEA' | 'DESCONECTADO'; ultimaConexion: string | null;
}

interface Simulacion {
  idSimulacion: number; magnitudSimulada: number; estadoEnvio: 'PENDIENTE' | 'ENVIADA' | 'FALLIDA';
  fecha: string; dispositivo: { idDispositivo: number; nombre: string };
}

interface ConfiguracionAnalisis {
  idConfig: number; ventanaDias: number; periodoBaseMeses: number; umbralElevada: number;
  umbralAlta: number; minEventosZona: number; fechaActualizacion: string;
}
```

## Autenticación

| Método | Ruta | Rol | Cuerpo / parámetros | Respuesta |
|---|---|---|---|---|
| POST | `/api/auth/login` | Público | `{ correo, contrasena }` | `200 { token, expiraEn: string, usuario: Usuario }` · `401` credenciales inválidas · `429` |
| GET | `/api/auth/yo` | Usuario | — | `200 Usuario` |

## Sismos y estadísticas

Filtros comunes (query, todos opcionales):
- `desde` y `hasta`, como fecha `YYYY-MM-DD` en hora Colombia;
- `departamento`;
- `magMin` y `magMax`;
- `profMin` y `profMax`;
- `fuente`;
- `incluirAnomalos`: `true` o `false`; por defecto `false`.

| Método | Ruta | Rol | Respuesta |
|---|---|---|---|
| GET | `/api/sismos?…filtros&pagina&tamano&orden` | Usuario | `Paginado<Sismo>`. `orden` admite `fecha_desc` (por defecto), `fecha_asc`, `magnitud_desc` y `magnitud_asc` |
| GET | `/api/sismos/exportar?…filtros` | Usuario | `text/csv` (UTF-8 con BOM, separador `,`), con un máximo de 100 000 filas |
| GET | `/api/departamentos` | Usuario | `string[]`, ordenado |
| GET | `/api/estadisticas?…filtros` | Usuario | Ver abajo |

```ts
interface Estadisticas {
  total: number; magnitudMax: number | null; profundidadMediana: number | null;
  rango: { desde: string | null; hasta: string | null };          // fechas extremas del filtro
  porDepartamento: Array<{ departamento: string; total: number; magnitudMax: number }>;
  histograma: Array<{ desde: number; hasta: number; total: number }>; // bins de 0,5 en magnitud
  puntos: Array<{ idSismo: number; latitud: number; longitud: number; magnitud: number;
                  profundidadKm: number; fechaHora: string; municipio: string | null }>;
  // puntos: como máximo 5000, priorizando las magnitudes mayores
}
```

## Análisis de frecuencia y advertencias

Toda respuesta de esta sección incluye `fechaCorte`, la fecha del último dato del catálogo usado. El frontend la muestra como "Datos hasta …".

| Método | Ruta | Rol | Respuesta |
|---|---|---|---|
| GET | `/api/analisis/zonas` | Usuario | `Array<{ zona; region; agrupadaEn: string \| null; nEventos }>` |
| GET | `/api/analisis/frecuencia?zona=` | Usuario | `Frecuencia` |
| GET | `/api/analisis/gutenberg-richter?zona=` | Usuario | `GutenbergRichter` |
| GET | `/api/analisis/probabilidades` | Usuario | `{ fechaCorte, fechaCalculo, zonas: Array<{ zona; agrupadaEn; probabilidades: Array<{ magnitud: 4 \| 5 \| 6; anios1: number; anios10: number }> }> }` |
| GET | `/api/advertencias?zona=&nivel=` | Usuario | `{ fechaCorte, datos: Advertencia[] }` |
| GET | `/api/analisis/configuracion` | Admin | `ConfiguracionAnalisis` |
| PUT | `/api/analisis/configuracion` | Admin | Cuerpo `{ ventanaDias (1–90), periodoBaseMeses (1–120), umbralElevada (0–1), umbralAlta (0–1, < umbralElevada), minEventosZona (10–1000) }` → `ConfiguracionAnalisis` |
| POST | `/api/analisis/recalcular` | Admin | `202 { mensaje }` |

```ts
interface Frecuencia {
  zona: string; agrupadaEn: string | null; fechaCorte: string;
  serieMensual: Array<{ mes: string /* 'YYYY-MM' */; eventos: number; mediaMovil12: number | null }>;
  mannKendall: { tau: number; pValor: number; pendienteSen: number /* eventos/mes */;
                 interceptoSen: number; alfa: number; significativa: boolean;
                 tendencia: 'CRECIENTE' | 'DECRECIENTE' | 'SIN_TENDENCIA' };
}
interface GutenbergRichter {
  zona: string; agrupadaEn: string | null; fechaCorte: string;
  mc: number; a: number; b: number; errorB: number; nEventos: number; anios: number; tasaAnual: number;
  puntos: Array<{ magnitud: number; acumulado: number /* N(≥M) */; incremental: number }>;
}
interface Advertencia {
  idAdvertencia: number; zona: string; ventanaInicio: string; ventanaFin: string;
  eventosObservados: number; eventosEsperados: number; pValor: number;
  nivel: NivelAdvertencia; fechaEmision: string;
}
```

## Modelo de impacto

| Método | Ruta | Rol | Cuerpo / respuesta |
|---|---|---|---|
| POST | `/api/predicciones` | Usuario | Cuerpo `{ magnitud (2–9), profundidadKm (0–700), latitud (−4,3–13,5), longitud (−82–−66,8) }` → `{ idPrediccion, nivelImpacto, probabilidad, probabilidades: Record<NivelImpacto, number>, modelo: { idModelo, version, algoritmo } }` · `503` si no hay modelo activo |
| GET | `/api/modelos` | Admin | `ModeloPredictivo[]` |
| POST | `/api/modelos/entrenar` | Admin | `201 { modelo: ModeloPredictivo, reporte: { clases: NivelImpacto[]; matrizConfusion: number[][]; porClase: Record<NivelImpacto, { precision; recall; f1; soporte }>; comparacion: Array<{ algoritmo; f1Macro }> } }`. Puede tardar hasta unos 2 minutos |
| PATCH | `/api/modelos/:id/activar` | Admin | `ModeloPredictivo`. Desactiva los demás |

## Simulación y ESP32

| Método | Ruta | Rol | Cuerpo / respuesta |
|---|---|---|---|
| POST | `/api/simulaciones` | Usuario | Cuerpo `{ magnitud (2,0–8,0, paso 0,1) }` → `201 Simulacion`. La respuesta espera la confirmación del ESP32 hasta 5 s: queda `ENVIADA` si llega y `FALLIDA` si no |
| GET | `/api/simulaciones?limite=10` | Usuario | `Simulacion[]`, las más recientes del usuario |
| GET | `/api/dispositivos/estado` | Usuario | `Dispositivo[]`. Es de lectura para usuarios, porque la pantalla de simulación muestra el estado |

Los LEDs se derivan de la magnitud y son iguales en el frontend y en el firmware:
- verde: siempre;
- amarillo: M ≥ 4,0;
- rojo: M ≥ 6,0;
- vibración: M ≥ 4,0;
- buzzer: M ≥ 6,0;
- duración: 5 s.

## Administración

| Método | Ruta | Rol | Cuerpo / respuesta |
|---|---|---|---|
| POST | `/api/cargas` | Admin | `multipart/form-data`: `archivo` (CSV/XLSX, ≤ 25 MB) y, opcionalmente, `fuente: Fuente` y `zonaHoraria`. Responde `201 { cargas: Carga[], reporte: ReporteCarga }` o `422 { error, detalles }` si el archivo se rechaza |
| GET | `/api/cargas?pagina&tamano` | Admin | `Paginado<Carga>` |
| POST | `/api/sincronizaciones` | Admin | Sincroniza con USGS y UNGRD ahora → `201 { cargas: Carga[] }` |
| GET | `/api/usuarios?pagina&tamano` | Admin | `Paginado<Usuario>` |
| POST | `/api/usuarios` | Admin | Cuerpo `{ nombre, correo, contrasena (≥ 10, letras y números), rol }` → `201 Usuario` · `409` si el correo ya existe |
| PATCH | `/api/usuarios/:id` | Admin | Cuerpo `{ nombre?, rol?, activo?, contrasena? }` → `Usuario`. Un admin no puede desactivarse a sí mismo ni quitarse el rol |
| GET | `/api/admin/resumen` | Admin | Ver abajo |

```ts
interface ResumenAdmin {
  registros: number; registrosValidos: number; usuarios: number; usuariosActivos: number;
  modeloActivo: { idModelo: number; version: string; algoritmo: string; f1Macro: number } | null;
  dispositivo: { estado: 'EN_LINEA' | 'DESCONECTADO'; ultimaConexion: string | null } | null;
  ultimaCarga: Carga | null;
  actividadReciente: Array<{ tipo: 'CARGA' | 'PREDICCION' | 'SIMULACION' | 'ENTRENAMIENTO';
                             descripcion: string; fecha: string; usuario: string | null }>;
}
```

## Aviso de alcance

Toda vista con probabilidades o advertencias muestra este texto:

> Una advertencia indica que la actividad reciente supera estadísticamente el comportamiento habitual de la zona. No es un pronóstico de sismo ni reemplaza los boletines oficiales del SGC.
