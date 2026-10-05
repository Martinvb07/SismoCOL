import { env } from '../config/env.js';
import { ErrorHttp } from './errores.js';
import { logger } from './logger.js';

/** Cliente del servicio analítico interno (FastAPI). */
export async function llamarAnalytics<T>(
  ruta: string,
  opciones: { metodo?: 'GET' | 'POST'; cuerpo?: FormData | object; timeoutMs?: number } = {},
): Promise<T> {
  const { metodo = 'GET', cuerpo, timeoutMs = env.ANALYTICS_TIMEOUT_MS } = opciones;
  const cabeceras: Record<string, string> = { 'X-Token-Interno': env.ANALYTICS_TOKEN };
  let body: FormData | string | undefined;
  if (cuerpo instanceof FormData) {
    body = cuerpo;
  } else if (cuerpo !== undefined) {
    body = JSON.stringify(cuerpo);
    cabeceras['Content-Type'] = 'application/json';
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(new URL(ruta, env.ANALYTICS_URL), {
      method: metodo,
      headers: cabeceras,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    logger.error({ err: error, ruta }, 'Servicio analítico inalcanzable');
    throw new ErrorHttp(503, 'El servicio analítico no está disponible');
  }

  const datos = (await respuesta.json().catch(() => null)) as
    | (T & { error?: string; detail?: unknown })
    | null;
  if (!respuesta.ok) {
    // 4xx de FastAPI son errores del archivo o de los parámetros: se transmiten al usuario.
    if (respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 401) {
      const mensaje = datos?.error ?? (typeof datos?.detail === 'string' ? datos.detail : 'Solicitud rechazada');
      throw new ErrorHttp(respuesta.status, mensaje);
    }
    logger.error({ estado: respuesta.status, ruta, datos }, 'Error del servicio analítico');
    throw new ErrorHttp(502, 'El servicio analítico respondió con un error');
  }
  return datos as T;
}
