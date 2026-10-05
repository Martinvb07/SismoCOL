/**
 * Tipos de la API REST de SismoCol.
 * Copia fiel de docs/api-contrato.md: si el contrato cambia, se actualiza aquí.
 */

export type Rol = 'ADMIN' | 'USUARIO';
export type Fuente = 'SGC' | 'UNGRD' | 'DESINVENTAR' | 'USGS';
export type NivelImpacto = 'SIN_AFECTACION' | 'BAJO' | 'MODERADO' | 'ALTO';
export type NivelAdvertencia = 'NORMAL' | 'ELEVADA' | 'ALTA';
export type PrecisionUbicacion = 'EPICENTRO' | 'CENTROIDE_MUNICIPIO';
export type EstadoDispositivo = 'EN_LINEA' | 'DESCONECTADO';
export type EstadoEnvio = 'PENDIENTE' | 'ENVIADA' | 'FALLIDA';
export type OrdenSismos = 'fecha_desc' | 'fecha_asc' | 'magnitud_desc' | 'magnitud_asc';
export type Tendencia = 'CRECIENTE' | 'DECRECIENTE' | 'SIN_TENDENCIA';

export const FUENTES: readonly Fuente[] = ['SGC', 'UNGRD', 'DESINVENTAR', 'USGS'];
export const NIVELES_IMPACTO: readonly NivelImpacto[] = ['SIN_AFECTACION', 'BAJO', 'MODERADO', 'ALTO'];
export const NIVELES_ADVERTENCIA: readonly NivelAdvertencia[] = ['NORMAL', 'ELEVADA', 'ALTA'];
export const ROLES: readonly Rol[] = ['ADMIN', 'USUARIO'];

export interface Paginado<T> {
  datos: T[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface DetalleError {
  campo: string;
  mensaje: string;
}

export interface CuerpoError {
  error: string;
  detalles?: DetalleError[];
}

export interface Usuario {
  idUsuario: number;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  fechaCreacion: string;
}

export interface Sismo {
  idSismo: number;
  fechaHora: string;
  latitud: number | null;
  longitud: number | null;
  precisionUbicacion: PrecisionUbicacion | null;
  profundidadKm: number | null;
  magnitud: number | null;
  departamento: string | null;
  municipio: string | null;
  zona: string | null;
  fuente: Fuente;
  nivelImpacto: NivelImpacto | null;
  esReplica: boolean;
  esAnomalo: boolean;
  motivoAnomalia: string | null;
}

export interface Carga {
  idCarga: number;
  origen: 'ARCHIVO' | 'API';
  fuente: Fuente;
  nombreArchivo: string;
  registrosLeidos: number;
  registrosValidos: number;
  estado: 'PROCESADO' | 'RECHAZADO';
  fechaCarga: string;
  usuario: { idUsuario: number; nombre: string } | null;
}

export interface ReporteFuente {
  fuente: Fuente;
  leidos: number;
  validos: number;
  nuevos: number;
  existentes: number;
  porMotivo: Record<string, number>;
  conEpicentro: number;
  conCentroide: number;
  conAfectacion: number;
}

export interface ReporteCarga {
  leidos: number;
  validos: number;
  rechazadosSinFecha: number;
  /** campo SismoCol → columna del archivo */
  mapeo: Record<string, string>;
  columnasIgnoradas: string[];
  porFuente: ReporteFuente[];
  /** Avisos no bloqueantes (p. ej. USGS no respondió y se usaron centroides). */
  avisos: string[];
}

export interface ModeloPredictivo {
  idModelo: number;
  version: string;
  algoritmo: string;
  exactitud: number;
  f1Macro: number;
  activo: boolean;
  fechaEntrenamiento: string;
}

export interface Dispositivo {
  idDispositivo: number;
  nombre: string;
  topicoMqtt: string;
  estado: EstadoDispositivo;
  ultimaConexion: string | null;
}

export interface Simulacion {
  idSimulacion: number;
  magnitudSimulada: number;
  estadoEnvio: EstadoEnvio;
  fecha: string;
  dispositivo: { idDispositivo: number; nombre: string };
}

export interface ConfiguracionAnalisis {
  idConfig: number;
  ventanaDias: number;
  periodoBaseMeses: number;
  umbralElevada: number;
  umbralAlta: number;
  minEventosZona: number;
  fechaActualizacion: string;
}

/* ---------- Autenticación ---------- */

export interface CuerpoLogin {
  correo: string;
  contrasena: string;
}

export interface RespuestaLogin {
  token: string;
  expiraEn: string;
  usuario: Usuario;
}

/* ---------- Sismos y estadísticas ---------- */

export interface FiltrosSismos {
  desde?: string;
  hasta?: string;
  departamento?: string;
  magMin?: number;
  magMax?: number;
  profMin?: number;
  profMax?: number;
  fuente?: Fuente;
  incluirAnomalos?: boolean;
}

export interface PuntoMapa {
  idSismo: number;
  latitud: number;
  longitud: number;
  magnitud: number;
  profundidadKm: number;
  fechaHora: string;
  municipio: string | null;
}

export interface BinHistograma {
  desde: number;
  hasta: number;
  total: number;
}

export interface Estadisticas {
  total: number;
  magnitudMax: number | null;
  profundidadMediana: number | null;
  rango: { desde: string | null; hasta: string | null };
  porDepartamento: Array<{ departamento: string; total: number; magnitudMax: number }>;
  histograma: BinHistograma[];
  puntos: PuntoMapa[];
}

/* ---------- Análisis de frecuencia ---------- */

export interface Zona {
  zona: string;
  region: string;
  agrupadaEn: string | null;
  nEventos: number;
}

export interface PuntoSerieMensual {
  /** 'YYYY-MM' */
  mes: string;
  eventos: number;
  mediaMovil12: number | null;
}

export interface MannKendall {
  tau: number;
  pValor: number;
  /** eventos/mes */
  pendienteSen: number;
  interceptoSen: number;
  alfa: number;
  significativa: boolean;
  tendencia: Tendencia;
}

export interface Frecuencia {
  zona: string;
  agrupadaEn: string | null;
  fechaCorte: string;
  serieMensual: PuntoSerieMensual[];
  mannKendall: MannKendall;
}

export interface PuntoGR {
  magnitud: number;
  /** N(≥M) */
  acumulado: number;
  incremental: number;
}

export interface GutenbergRichter {
  zona: string;
  agrupadaEn: string | null;
  fechaCorte: string;
  mc: number;
  /** Valor a ANUAL: log10 N_anual(≥M) = a − b·M */
  a: number;
  b: number;
  errorB: number;
  nEventos: number;
  anios: number;
  tasaAnual: number;
  puntos: PuntoGR[];
}

export type MagnitudProbabilidad = 4 | 5 | 6;

export interface ProbabilidadZona {
  zona: string;
  agrupadaEn: string | null;
  probabilidades: Array<{ magnitud: MagnitudProbabilidad; anios1: number; anios10: number }>;
}

export interface Probabilidades {
  fechaCorte: string;
  fechaCalculo: string;
  zonas: ProbabilidadZona[];
}

export interface Advertencia {
  idAdvertencia: number;
  zona: string;
  ventanaInicio: string;
  ventanaFin: string;
  eventosObservados: number;
  eventosEsperados: number;
  pValor: number;
  nivel: NivelAdvertencia;
  fechaEmision: string;
}

export interface RespuestaAdvertencias {
  fechaCorte: string;
  datos: Advertencia[];
}

export interface CuerpoConfiguracion {
  ventanaDias: number;
  periodoBaseMeses: number;
  umbralElevada: number;
  umbralAlta: number;
  minEventosZona: number;
}

/* ---------- Modelo de impacto ---------- */

export interface CuerpoPrediccion {
  magnitud: number;
  profundidadKm: number;
  latitud: number;
  longitud: number;
}

export interface RespuestaPrediccion {
  idPrediccion: number;
  nivelImpacto: NivelImpacto;
  probabilidad: number;
  probabilidades: Record<NivelImpacto, number>;
  modelo: { idModelo: number; version: string; algoritmo: string };
}

export interface MetricasClase {
  precision: number;
  recall: number;
  f1: number;
  soporte: number;
}

export interface ReporteEntrenamiento {
  clases: NivelImpacto[];
  matrizConfusion: number[][];
  porClase: Record<NivelImpacto, MetricasClase>;
  comparacion: Array<{ algoritmo: string; f1Macro: number }>;
}

export interface RespuestaEntrenamiento {
  modelo: ModeloPredictivo;
  reporte: ReporteEntrenamiento;
}

/* ---------- Simulación ---------- */

export interface CuerpoSimulacion {
  magnitud: number;
}

/* ---------- Administración ---------- */

export interface RespuestaCarga {
  cargas: Carga[];
  reporte: ReporteCarga;
}

export interface RespuestaSincronizacion {
  cargas: Carga[];
  /** Fuentes que fallaron (p. ej. "USGS: ConnectionError"); la sincronización puede ser parcial. */
  errores: string[];
}

export interface CuerpoCrearUsuario {
  nombre: string;
  correo: string;
  contrasena: string;
  rol: Rol;
}

export interface CuerpoEditarUsuario {
  nombre?: string;
  rol?: Rol;
  activo?: boolean;
  contrasena?: string;
}

export type TipoActividad = 'CARGA' | 'PREDICCION' | 'SIMULACION' | 'ENTRENAMIENTO';

export interface ResumenAdmin {
  registros: number;
  registrosValidos: number;
  usuarios: number;
  usuariosActivos: number;
  modeloActivo: { idModelo: number; version: string; algoritmo: string; f1Macro: number } | null;
  dispositivo: { estado: EstadoDispositivo; ultimaConexion: string | null } | null;
  ultimaCarga: Carga | null;
  actividadReciente: Array<{
    tipo: TipoActividad;
    descripcion: string;
    fecha: string;
    usuario: string | null;
  }>;
}
