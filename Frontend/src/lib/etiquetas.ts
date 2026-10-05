import type { EstadoEnvio, Fuente, PrecisionUbicacion, Rol, TipoActividad } from '@/api/tipos';

export const ETIQUETAS_ROL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  USUARIO: 'Usuario',
};

export const ETIQUETAS_FUENTE: Record<Fuente, string> = {
  SGC: 'SGC',
  UNGRD: 'UNGRD',
  DESINVENTAR: 'DesInventar',
  USGS: 'USGS',
};

export const ETIQUETAS_PRECISION: Record<PrecisionUbicacion, string> = {
  EPICENTRO: 'Epicentro',
  CENTROIDE_MUNICIPIO: 'Centroide municipal',
};

export const ETIQUETAS_ENVIO: Record<EstadoEnvio, string> = {
  PENDIENTE: 'Pendiente',
  ENVIADA: 'Enviada',
  FALLIDA: 'Fallida',
};

export const ETIQUETAS_ACTIVIDAD: Record<TipoActividad, string> = {
  CARGA: 'Carga',
  PREDICCION: 'Predicción',
  SIMULACION: 'Simulación',
  ENTRENAMIENTO: 'Entrenamiento',
};

/** Nombres legibles de los campos del mapeo de columnas de una carga. */
export const ETIQUETAS_CAMPO_MAPEO: Record<string, string> = {
  id_evento: 'ID del evento',
  fecha: 'Fecha',
  hora: 'Hora',
  latitud: 'Latitud',
  longitud: 'Longitud',
  profundidad_km: 'Profundidad (km)',
  magnitud: 'Magnitud',
  tipo_magnitud: 'Tipo de magnitud',
  departamento: 'Departamento',
  municipio: 'Municipio',
  fuente: 'Fuente',
  fallecidos: 'Fallecidos',
  heridos: 'Heridos',
  desaparecidos: 'Desaparecidos',
  damnificados: 'Damnificados',
  viviendas_destruidas: 'Viviendas destruidas',
  viviendas_averiadas: 'Viviendas averiadas',
};

/** Motivos de anomalía posibles (los devuelve la ingesta en `porMotivo`). */
export const MOTIVOS_ANOMALIA = [
  'magnitud nula',
  'magnitud fuera de rango',
  'profundidad nula',
  'profundidad negativa',
  'profundidad fuera de rango',
  'fuera de Colombia',
  'departamento no reconocido',
  'sin ubicación',
  'duplicado',
  'repetido en el archivo',
] as const;
