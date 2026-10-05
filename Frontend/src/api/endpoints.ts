import { LIMITE_SIMULACIONES_RECIENTES, TIEMPO_ESPERA_ENTRENAMIENTO_MS } from '@/config';
import { peticion, peticionArchivo, type ValorQuery } from './cliente';
import type {
  Carga,
  ConfiguracionAnalisis,
  CuerpoConfiguracion,
  CuerpoCrearUsuario,
  CuerpoEditarUsuario,
  CuerpoLogin,
  CuerpoPrediccion,
  Dispositivo,
  Estadisticas,
  FiltrosSismos,
  Frecuencia,
  Fuente,
  GutenbergRichter,
  ModeloPredictivo,
  NivelAdvertencia,
  OrdenSismos,
  Paginado,
  Probabilidades,
  RespuestaAdvertencias,
  RespuestaCarga,
  RespuestaEntrenamiento,
  RespuestaLogin,
  RespuestaPrediccion,
  RespuestaSincronizacion,
  ResumenAdmin,
  Simulacion,
  Sismo,
  Usuario,
  Zona,
} from './tipos';

/** Convierte los filtros a parámetros de query del contrato. */
export function filtrosAQuery(filtros: FiltrosSismos): Record<string, ValorQuery> {
  return {
    desde: filtros.desde,
    hasta: filtros.hasta,
    departamento: filtros.departamento,
    magMin: filtros.magMin,
    magMax: filtros.magMax,
    profMin: filtros.profMin,
    profMax: filtros.profMax,
    fuente: filtros.fuente,
    incluirAnomalos: filtros.incluirAnomalos ? true : undefined,
  };
}

export interface ParametrosPaginacion {
  pagina: number;
  tamano: number;
}

/* ---------- Autenticación ---------- */
export const apiAuth = {
  login: (cuerpo: CuerpoLogin) =>
    peticion<RespuestaLogin>('/api/auth/login', { metodo: 'POST', cuerpo, publica: true }),
  yo: () => peticion<Usuario>('/api/auth/yo'),
};

/* ---------- Sismos ---------- */
export const apiSismos = {
  listar: (filtros: FiltrosSismos, paginacion: ParametrosPaginacion, orden: OrdenSismos) =>
    peticion<Paginado<Sismo>>('/api/sismos', {
      query: { ...filtrosAQuery(filtros), ...paginacion, orden },
    }),
  exportar: (filtros: FiltrosSismos) =>
    peticionArchivo('/api/sismos/exportar', { query: filtrosAQuery(filtros) }),
  departamentos: () => peticion<string[]>('/api/departamentos'),
  estadisticas: (filtros: FiltrosSismos) =>
    peticion<Estadisticas>('/api/estadisticas', { query: filtrosAQuery(filtros) }),
};

/* ---------- Análisis ---------- */
export const apiAnalisis = {
  zonas: () => peticion<Zona[]>('/api/analisis/zonas'),
  frecuencia: (zona: string) => peticion<Frecuencia>('/api/analisis/frecuencia', { query: { zona } }),
  gutenbergRichter: (zona: string) =>
    peticion<GutenbergRichter>('/api/analisis/gutenberg-richter', { query: { zona } }),
  probabilidades: () => peticion<Probabilidades>('/api/analisis/probabilidades'),
  advertencias: (filtro: { zona?: string; nivel?: NivelAdvertencia } = {}) =>
    peticion<RespuestaAdvertencias>('/api/advertencias', { query: filtro }),
  configuracion: () => peticion<ConfiguracionAnalisis>('/api/analisis/configuracion'),
  guardarConfiguracion: (cuerpo: CuerpoConfiguracion) =>
    peticion<ConfiguracionAnalisis>('/api/analisis/configuracion', { metodo: 'PUT', cuerpo }),
  recalcular: () => peticion<{ mensaje: string }>('/api/analisis/recalcular', { metodo: 'POST' }),
};

/* ---------- Modelo de impacto ---------- */
export const apiModelos = {
  predecir: (cuerpo: CuerpoPrediccion) =>
    peticion<RespuestaPrediccion>('/api/predicciones', { metodo: 'POST', cuerpo }),
  listar: () => peticion<ModeloPredictivo[]>('/api/modelos'),
  entrenar: () =>
    peticion<RespuestaEntrenamiento>('/api/modelos/entrenar', {
      metodo: 'POST',
      tiempoEsperaMs: TIEMPO_ESPERA_ENTRENAMIENTO_MS,
    }),
  activar: (idModelo: number) =>
    peticion<ModeloPredictivo>(`/api/modelos/${idModelo}/activar`, { metodo: 'PATCH' }),
};

/* ---------- Simulación ---------- */
export const apiSimulacion = {
  enviar: (magnitud: number) =>
    peticion<Simulacion>('/api/simulaciones', { metodo: 'POST', cuerpo: { magnitud } }),
  recientes: (limite: number = LIMITE_SIMULACIONES_RECIENTES) =>
    peticion<Simulacion[]>('/api/simulaciones', { query: { limite } }),
  dispositivos: () => peticion<Dispositivo[]>('/api/dispositivos/estado'),
};

/* ---------- Administración ---------- */
export const apiAdmin = {
  cargarArchivo: (archivo: File, fuente?: Fuente, zonaHoraria?: string) => {
    const datos = new FormData();
    datos.append('archivo', archivo);
    if (fuente) datos.append('fuente', fuente);
    if (zonaHoraria) datos.append('zonaHoraria', zonaHoraria);
    return peticion<RespuestaCarga>('/api/cargas', { metodo: 'POST', cuerpo: datos });
  },
  cargas: (paginacion: ParametrosPaginacion) =>
    peticion<Paginado<Carga>>('/api/cargas', { query: { ...paginacion } }),
  sincronizar: () => peticion<RespuestaSincronizacion>('/api/sincronizaciones', { metodo: 'POST' }),
  usuarios: (paginacion: ParametrosPaginacion) =>
    peticion<Paginado<Usuario>>('/api/usuarios', { query: { ...paginacion } }),
  crearUsuario: (cuerpo: CuerpoCrearUsuario) =>
    peticion<Usuario>('/api/usuarios', { metodo: 'POST', cuerpo }),
  editarUsuario: (idUsuario: number, cuerpo: CuerpoEditarUsuario) =>
    peticion<Usuario>(`/api/usuarios/${idUsuario}`, { metodo: 'PATCH', cuerpo }),
  resumen: () => peticion<ResumenAdmin>('/api/admin/resumen'),
};

/** Claves de TanStack Query centralizadas. */
export const claves = {
  yo: ['auth', 'yo'] as const,
  departamentos: ['departamentos'] as const,
  sismos: (filtros: FiltrosSismos, paginacion: ParametrosPaginacion, orden: OrdenSismos) =>
    ['sismos', filtros, paginacion, orden] as const,
  estadisticas: (filtros: FiltrosSismos) => ['estadisticas', filtros] as const,
  zonas: ['analisis', 'zonas'] as const,
  frecuencia: (zona: string) => ['analisis', 'frecuencia', zona] as const,
  gutenbergRichter: (zona: string) => ['analisis', 'gr', zona] as const,
  probabilidades: ['analisis', 'probabilidades'] as const,
  advertencias: ['advertencias'] as const,
  configuracion: ['analisis', 'configuracion'] as const,
  modelos: ['modelos'] as const,
  simulaciones: ['simulaciones'] as const,
  dispositivos: ['dispositivos'] as const,
  cargas: (paginacion: ParametrosPaginacion) => ['cargas', paginacion] as const,
  usuarios: (paginacion: ParametrosPaginacion) => ['usuarios', paginacion] as const,
  resumen: ['admin', 'resumen'] as const,
};
