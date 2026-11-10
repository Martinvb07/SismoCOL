import type { Fuente } from '@/api/tipos';

/** Magnitud mínima para pedir un pronóstico de réplicas (igual que en Analytics). */
export const MAGNITUD_MIN_REPLICAS = 4;
/** Fuentes instrumentales: las únicas con pronóstico de réplicas. */
const FUENTES_INSTRUMENTALES: readonly Fuente[] = ['SGC', 'USGS'];

export function admiteReplicas(s: { magnitud: number | null; fuente: Fuente; esAnomalo?: boolean }): boolean {
  return !s.esAnomalo && s.magnitud !== null && s.magnitud >= MAGNITUD_MIN_REPLICAS && FUENTES_INSTRUMENTALES.includes(s.fuente);
}

/** Ruta de la vista de réplicas con el sismo ya elegido. */
export function rutaReplicas(idSismo: number): string {
  return `/replicas?sismo=${idSismo}`;
}
