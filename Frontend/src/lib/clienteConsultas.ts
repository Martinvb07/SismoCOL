import { QueryClient } from '@tanstack/react-query';
import { esErrorApi } from '@/api/cliente';
import { TIEMPO_FRESCO_CONSULTAS_MS } from '@/config';

const MAX_REINTENTOS = 2;
/** Errores que no mejoran al reintentar. */
const ESTADOS_SIN_REINTENTO = new Set([400, 401, 403, 404, 409, 422]);

export function crearClienteConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: TIEMPO_FRESCO_CONSULTAS_MS,
        refetchOnWindowFocus: false,
        retry: (intentos, error) => !(esErrorApi(error) && ESTADOS_SIN_REINTENTO.has(error.estado)) && intentos < MAX_REINTENTOS,
      },
      mutations: { retry: false },
    },
  });
}
