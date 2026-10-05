import { borrarSesion, leerToken } from '@/auth/almacenSesion';
import { TIEMPO_ESPERA_PETICION_MS, URL_API } from '@/config';
import type { CuerpoError, DetalleError } from './tipos';

export const ESTADO_SIN_CONEXION = 0;
const HTTP_SIN_CONTENIDO = 204;
const HTTP_NO_AUTORIZADO = 401;

const MENSAJES_POR_ESTADO: Record<number, string> = {
  [ESTADO_SIN_CONEXION]: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  400: 'Los datos enviados no son válidos.',
  401: 'Tu sesión expiró. Inicia sesión de nuevo.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'El recurso solicitado no existe.',
  409: 'La operación entra en conflicto con datos existentes.',
  422: 'El archivo fue rechazado.',
  429: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
  500: 'Ocurrió un error interno en el servidor.',
  502: 'El servicio analítico no responde. Inténtalo más tarde.',
  503: 'El servicio analítico no está disponible. Inténtalo más tarde.',
};
const MENSAJE_GENERICO = 'Ocurrió un error inesperado.';
const MENSAJE_TIEMPO_AGOTADO = 'La solicitud tardó demasiado en responder.';

export function mensajePorEstado(estado: number): string {
  return MENSAJES_POR_ESTADO[estado] ?? MENSAJE_GENERICO;
}

/** Error normalizado de la API: { error, detalles } + código HTTP. */
export class ErrorApi extends Error {
  readonly estado: number;
  readonly detalles: DetalleError[];

  constructor(estado: number, mensaje: string, detalles: DetalleError[] = []) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.detalles = detalles;
  }

  /** Mensaje del detalle asociado a un campo, si existe. */
  detalleDe(campo: string): string | undefined {
    return this.detalles.find((d) => d.campo === campo)?.mensaje;
  }
}

export function esErrorApi(error: unknown): error is ErrorApi {
  return error instanceof ErrorApi;
}

/** Devuelve un mensaje legible para cualquier error. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return MENSAJE_GENERICO;
}

type ManejadorNoAutorizado = () => void;
let manejadorNoAutorizado: ManejadorNoAutorizado | null = null;

/** El proveedor de sesión registra aquí cómo redirigir a /login ante un 401. */
export function registrarManejadorNoAutorizado(manejador: ManejadorNoAutorizado | null): void {
  manejadorNoAutorizado = manejador;
}

export type ValorQuery = string | number | boolean | null | undefined;

export interface OpcionesPeticion {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  cuerpo?: unknown;
  query?: Record<string, ValorQuery>;
  /** Petición pública: no envía token ni dispara el cierre de sesión en 401 (login). */
  publica?: boolean;
  tiempoEsperaMs?: number;
  senal?: AbortSignal;
}

/** Construye la query omitiendo valores vacíos. */
export function construirQuery(query: Record<string, ValorQuery> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(query)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (typeof valor === 'number' && Number.isNaN(valor)) continue;
    params.append(clave, String(valor));
  }
  const texto = params.toString();
  return texto ? `?${texto}` : '';
}

export function construirUrl(ruta: string, query?: Record<string, ValorQuery>): string {
  return `${URL_API}${ruta}${construirQuery(query)}`;
}

function esCuerpoError(valor: unknown): valor is CuerpoError {
  return typeof valor === 'object' && valor !== null && typeof (valor as { error?: unknown }).error === 'string';
}

async function leerError(respuesta: Response): Promise<ErrorApi> {
  let cuerpo: unknown = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // cuerpo vacío o no JSON
  }
  if (esCuerpoError(cuerpo)) {
    const detalles = Array.isArray(cuerpo.detalles) ? cuerpo.detalles : [];
    return new ErrorApi(respuesta.status, cuerpo.error, detalles);
  }
  return new ErrorApi(respuesta.status, mensajePorEstado(respuesta.status));
}

/** Ejecuta la petición y devuelve la Response cruda (ya validada: 2xx). */
async function ejecutar(ruta: string, opciones: OpcionesPeticion): Promise<Response> {
  const { metodo = 'GET', cuerpo, query, publica = false, tiempoEsperaMs = TIEMPO_ESPERA_PETICION_MS, senal } = opciones;

  const cabeceras = new Headers({ Accept: 'application/json' });
  let cuerpoFinal: BodyInit | undefined;
  if (cuerpo instanceof FormData) {
    cuerpoFinal = cuerpo;
  } else if (cuerpo !== undefined) {
    cabeceras.set('Content-Type', 'application/json');
    cuerpoFinal = JSON.stringify(cuerpo);
  }
  if (!publica) {
    const token = leerToken();
    if (token) cabeceras.set('Authorization', `Bearer ${token}`);
  }

  const controlador = new AbortController();
  let agotado = false;
  const temporizador = setTimeout(() => {
    agotado = true;
    controlador.abort();
  }, tiempoEsperaMs);
  const abortarExterno = () => controlador.abort();
  senal?.addEventListener('abort', abortarExterno);

  let respuesta: Response;
  try {
    respuesta = await fetch(construirUrl(ruta, query), {
      method: metodo,
      headers: cabeceras,
      body: cuerpoFinal,
      signal: controlador.signal,
    });
  } catch (error) {
    if (agotado) throw new ErrorApi(ESTADO_SIN_CONEXION, MENSAJE_TIEMPO_AGOTADO);
    if (senal?.aborted) throw error;
    throw new ErrorApi(ESTADO_SIN_CONEXION, mensajePorEstado(ESTADO_SIN_CONEXION));
  } finally {
    clearTimeout(temporizador);
    senal?.removeEventListener('abort', abortarExterno);
  }

  if (!respuesta.ok) {
    const error = await leerError(respuesta);
    if (respuesta.status === HTTP_NO_AUTORIZADO && !publica) {
      borrarSesion();
      manejadorNoAutorizado?.();
    }
    throw error;
  }
  return respuesta;
}

/** Petición JSON tipada. */
export async function peticion<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const respuesta = await ejecutar(ruta, opciones);
  if (respuesta.status === HTTP_SIN_CONTENIDO) return undefined as T;
  try {
    return (await respuesta.json()) as T;
  } catch {
    throw new ErrorApi(respuesta.status, 'La respuesta del servidor no es válida.');
  }
}

/** Petición que devuelve un archivo (p. ej. CSV). */
export async function peticionArchivo(ruta: string, opciones: OpcionesPeticion = {}): Promise<Blob> {
  const respuesta = await ejecutar(ruta, opciones);
  return respuesta.blob();
}
