import { z } from 'zod';

export const TAMANO_POR_DEFECTO = 25;
export const TAMANO_MAXIMO = 100;

export const esquemaPaginacion = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(TAMANO_MAXIMO).default(TAMANO_POR_DEFECTO),
});

export function paginado<T>(datos: T[], total: number, pagina: number, tamano: number) {
  return { datos, total, pagina, tamano };
}
