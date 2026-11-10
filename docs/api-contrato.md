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
type Fuente = 'SGC' | 'UNGRD' | 'DESINVENTAR' | 'USGS' | 'USGS_HIST';  // USGS_HIST: catálogo histórico M ≥ 4,5 (D14)
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
  mapeo: Record<string, string>;          // campo canónico en snake_case (id_evento, profundidad_km, fallecidos…) → columna del archivo
  columnasIgnoradas: string[];
  avisos: string[];                       // p. ej. USGS no disponible: se usaron centroides
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
| POST | `/api/auth/login` | Público | `{ correo, contrasena }` | `200 { token, expiraEn: string, usuario: Usuario }` · `401` credenciales inválidas **o usuario inactivo** (mismo mensaje, para no revelar qué cuentas existen) · `429` |
| GET | `/api/auth/yo` | Usuario | — | `200 Usuario` |

## Sismos y estadísticas

Filtros comunes (query, todos opcionales):
- `desde` y `hasta`, como fecha `YYYY-MM-DD` en hora Colombia;
- `departamento`;
- `magMin` y `magMax`;
- `profMin` y `profMax`;
- `fuente` (sin este filtro se excluye `USGS_HIST`, que solo se ve si se pide explícitamente);
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
  histograma: Array<{ desde: number; hasta: number; total: number }>; // bins de 0,5: [desde, hasta), el último cerrado
  puntos: Array<{ idSismo: number; latitud: number; longitud: number; magnitud: number;
                  profundidadKm: number; fechaHora: string; municipio: string | null }>;
  // puntos: como máximo 5000, priorizando las magnitudes mayores
}
```

## Análisis de frecuencia y advertencias

Toda respuesta de esta sección incluye `fechaCorte`, la fecha del último dato del catálogo usado. El frontend la muestra como "Datos hasta …".

Si todavía no hay catálogo SGC cargado, estas rutas responden `409` con un mensaje para el usuario. Una zona que no existe responde `404`.

| Método | Ruta | Rol | Respuesta |
|---|---|---|---|
| GET | `/api/analisis/zonas` | Usuario | `Array<{ zona; region; agrupadaEn: string \| null; nEventos }>` |
| GET | `/api/analisis/frecuencia?zona=` | Usuario | `Frecuencia`. `zona` es siempre el nombre de la zona (p. ej. `Guaviare`), nunca el de la región; si la zona se agrupó, la respuesta trae `agrupadaEn` |
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

## Pronóstico de actividad por zona

| Método | Ruta | Rol | Cuerpo / respuesta |
|---|---|---|---|
| GET | `/api/analisis/pronostico?zona=` | Usuario | `PronosticoActividad` del último cálculo · `409` si la zona está agrupada o tiene pocos meses. Ver D16 |

```ts
type ModeloPronostico = 'SARIMA' | 'INGENUO' | 'MEDIA_MOVIL_12';
interface PuntoPronostico { mes: string /* AAAA-MM */; valor; inferior80; superior80; inferior95; superior95 }
interface PronosticoActividad {
  zona; modeloGanador: ModeloPronostico; mc; periodoInicio: string; periodoFin: string; nMeses;
  parametros: { mc; ordenSarima: number[]; ordenEstacional: number[]; aic: number | null; transformacion; horizonteMeses;
                horizonteBacktest; minMesesEntrenamiento; catalogo; seleccionOrden };
  serie: Array<{ mes: string; eventos: number }>;
  pronostico: PuntoPronostico[];                                  // del modelo ganador
  pronosticos: Record<ModeloPronostico, PuntoPronostico[]>;
  backtesting: Array<{ modelo: ModeloPronostico; mae: number | null; mape: number | null; nPronosticos: number;
                       maePorHorizonte: Record<string, number> }>;  // de menor a mayor MAE
  fechaCalculo: string;
}
```

## Pronóstico de réplicas

Reasenberg-Jones por sismo principal (M ≥ 6 configurable con `REPLICAS_MAGNITUD_MIN` en Analytics). Ver D15.

| Método | Ruta | Rol | Cuerpo / respuesta |
|---|---|---|---|
| GET | `/api/replicas` | Usuario | `ResumenPrincipal[]` del último cálculo (más reciente primero) |
| GET | `/api/replicas/:id` | Usuario | `DetalleReplicas` · `404` si el sismo no tiene pronóstico |
| POST | `/api/replicas/recalcular` | Admin | `201 { estado: 'listo' \| 'en_curso' \| 'sin_datos', principales?: number }`. También se recalcula después de cada carga o sincronización |
| POST | `/api/replicas/:id/validar` | Admin | Validación retrospectiva con 24 h, 72 h y 7 días de ajuste → `201 { idSismo, resumen, resumenGenerico, ventanas }` |

```ts
type MetodoReplicas = 'MAXIMA_VEROSIMILITUD' | 'GENERICO_A_SECUENCIA' | 'GENERICO';
interface SismoPrincipal { idSismo; fechaHora; magnitud; profundidadKm: number | null; latitud; longitud; municipio: string | null; departamento: string | null; fuente: Fuente }
interface ResumenPrincipal extends SismoPrincipal { metodo: MetodoReplicas; nReplicas: number; probabilidad7dM4: number; tieneValidacion: boolean; fechaCalculo: string }
interface PronosticoMagnitud { magnitud; esperado; probabilidad /* P(≥1) */; ic95: [number, number]; observado?; dentroIc95?; logVerosimilitud? }
interface HorizonteReplicas { horizonte: '24h' | '7d' | '30d'; dias: number; cobertura?: number; magnitudes: PronosticoMagnitud[] }
interface PronosticoReplicas {
  idPronostico; tipo: 'PRONOSTICO' | 'VALIDACION'; horasAjuste: number | null; inicioAjuste; finAjuste;
  metodo: MetodoReplicas; nReplicas; mc; a; b; p; c;
  parametros: { magnitudMinPrincipal; ventanaKm; ventanaDias; fuentes: Fuente[]; datosHasta; finCatalogoSgc: string | null;
                nSecuencia; modelo: string; bEstimado: boolean; errorB: number | null; avisos: string[] };
  resultados: { horizontes: HorizonteReplicas[]; curva: Array<{ dias; observado: number | null; esperado; inferior; superior }>;
                horizontesGenerico?: HorizonteReplicas[]; resumen?: ResumenValidacion; resumenGenerico?: ResumenValidacion };
  fechaCalculo: string;
}
interface ResumenValidacion { casos: number; fraccionDentroIc95?: number; errorAbsolutoMedio?: number; logVerosimilitudTotal?: number }
interface DetalleReplicas { principal: SismoPrincipal; pronostico: PronosticoReplicas; validacion: PronosticoReplicas[] }
```

## Modelo de impacto

| Método | Ruta | Rol | Cuerpo / respuesta |
|---|---|---|---|
| POST | `/api/predicciones` | Usuario | Cuerpo `{ magnitud (2–9), profundidadKm (0–700), latitud (−4,3–13,5), longitud (−82–−66,8) }` → `{ idPrediccion, nivelImpacto, probabilidad, probabilidades: Record<NivelImpacto, number>, modelo: { idModelo, version, algoritmo, fechaEntrenamiento } }` · `503` si no hay modelo activo |
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
- buzzer: M ≥ 6,0;
- maqueta: motor vibrador si M < 6,0 y movimiento de ida y vuelta si M ≥ 6,0 (`Firmware/esp32/README.md`);
- duración: 5 s.

## Administración

| Método | Ruta | Rol | Cuerpo / respuesta |
|---|---|---|---|
| POST | `/api/cargas` | Admin | `multipart/form-data`: `archivo` (CSV/XLSX, ≤ 25 MB) y, opcionalmente, `fuente: Fuente` y `zonaHoraria` (identificador IANA, p. ej. `UTC` o `America/Bogota`; si se omite, se usa la zona propia de cada fuente). Responde `201 { cargas: Carga[], reporte: ReporteCarga }` o `422 { error, detalles }` si el archivo se rechaza |
| GET | `/api/cargas?pagina&tamano` | Admin | `Paginado<Carga>` |
| POST | `/api/sincronizaciones` | Admin | Sincroniza con USGS y UNGRD ahora → `201 { cargas: Carga[], errores: string[] }` (`errores` lista las fuentes que fallaron, p. ej. `"USGS: ConnectionError"`) |
| POST | `/api/sincronizaciones/usgs-historico` | Admin | Cuerpo opcional `{ anioInicio?: number }`. Descarga el catálogo USGS M ≥ 4,5 desde 1973 (por defecto incremental desde el año del último evento) y lo guarda como `USGS_HIST` → `201 { cargas: Carga[], errores: string[] }` |
| GET | `/api/usuarios?pagina&tamano` | Admin | `Paginado<Usuario>` |
| POST | `/api/usuarios` | Admin | Cuerpo `{ nombre, correo, contrasena (≥ 10, letras y números), rol }` → `201 Usuario` · `409` si el correo ya existe |
| PATCH | `/api/usuarios/:id` | Admin | Cuerpo `{ nombre?, rol?, activo?, contrasena? }` → `Usuario` · `409` si un admin intenta desactivarse a sí mismo o quitarse el rol |
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

Las vistas de pronósticos (réplicas, actividad por zona, periodos de retorno, amenaza) muestran este otro (RNF12):

> Este es un pronóstico probabilístico calculado con modelos estadísticos y validado con datos pasados. No predice la fecha, el lugar ni la magnitud de un sismo, y no reemplaza los boletines oficiales del SGC ni las indicaciones de la UNGRD.
