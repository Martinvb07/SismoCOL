import type { Fuente } from '@/api/tipos';

/** Desde esta magnitud un sismo se considera fuerte y se destaca en la vista de réplicas. */
export const MAGNITUD_SISMO_FUERTE = 6;
/** Fuentes instrumentales: las únicas con pronóstico de réplicas. */
const FUENTES_INSTRUMENTALES: readonly Fuente[] = ['SGC', 'USGS'];

export function admiteReplicas(s: { magnitud: number | null; fuente: Fuente; esAnomalo?: boolean }): boolean {
  // Cualquier sismo instrumental con magnitud: para los pequeños el pronóstico dirá que casi no se esperan réplicas.
  return !s.esAnomalo && s.magnitud !== null && FUENTES_INSTRUMENTALES.includes(s.fuente);
}

/** Ruta de la vista de réplicas con el sismo ya elegido. */
export function rutaReplicas(idSismo: number): string {
  return `/replicas?sismo=${idSismo}`;
}
