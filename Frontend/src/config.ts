/** Configuración y constantes globales del frontend. */

const URL_API_POR_DEFECTO = 'http://localhost:4000';

/** URL base de la API sin barra final. Cadena vacía = mismo origen. */
export const URL_API: string = (import.meta.env.VITE_API_URL ?? URL_API_POR_DEFECTO).replace(/\/+$/, '');

/** true si se deben usar los datos simulados de MSW. */
export const USAR_MOCKS: boolean = import.meta.env.VITE_USAR_MOCKS === 'true';

export const ZONA_HORARIA = 'America/Bogota';
export const LOCALE = 'es-CO';

/** Clave de sessionStorage donde se guarda la sesión. */
export const CLAVE_SESION = 'sismocol.sesion';

export const TAMANO_PAGINA_POR_DEFECTO = 25;
export const TAMANO_PAGINA_MAXIMO = 100;
export const LIMITE_SIMULACIONES_RECIENTES = 10;

/** Intervalo de refresco del estado del ESP32 (ms). */
export const REFRESCO_DISPOSITIVO_MS = 10_000;
/** Duración de la señal en el ESP32 y en la animación de LEDs (ms). */
export const DURACION_SENAL_MS = 5_000;

/** Tiempo de espera del entrenamiento del modelo (puede tardar ~2 min). */
export const TIEMPO_ESPERA_ENTRENAMIENTO_MS = 4 * 60_000;
/** Tiempo de espera por defecto para el resto de peticiones. */
export const TIEMPO_ESPERA_PETICION_MS = 30_000;

export const TAMANO_MAXIMO_ARCHIVO_BYTES = 25 * 1024 * 1024;
export const EXTENSIONES_ARCHIVO_PERMITIDAS = ['.csv', '.xlsx'] as const;

export const RUTA_GEOJSON_DEPARTAMENTOS = `${import.meta.env.BASE_URL}geo/colombia-departamentos.json`;

/** Tiempo que una consulta se considera fresca (TanStack Query). */
export const TIEMPO_FRESCO_CONSULTAS_MS = 60_000;

/** Texto exacto del aviso de alcance (docs/api-contrato.md). */
export const AVISO_ALCANCE =
  'Una advertencia indica que la actividad reciente supera estadísticamente el comportamiento habitual de la zona. No es un pronóstico de sismo ni reemplaza los boletines oficiales del SGC.';
