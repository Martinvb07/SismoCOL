/**
 * Umbrales del semáforo «bajo / moderado / alto» de las vistas de analítica.
 * Es el único lugar donde se definen: cámbielos aquí y la explicación del
 * tooltip se actualiza sola.
 */
import type { NivelAdvertencia, NivelImpacto } from '@/api/tipos';

export type NivelSemaforo = 'BAJO' | 'MODERADO' | 'ALTO';

export interface ReglaSemaforo {
  /** Qué se mide, en palabras simples. */
  indicador: string;
  /** [desde moderado, desde alto] */
  umbrales: readonly [number, number];
  /** Criterio de cada nivel en palabras simples (para el tooltip). */
  criterio: (moderado: number, alto: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}\u00a0%`;

export const SEMAFORO = {
  replicas: {
    indicador: 'la probabilidad de al menos una réplica de magnitud 5 o mayor en los próximos 7 días',
    umbrales: [0.1, 0.3],
    criterio: (m, a) => `Bajo: menos de ${pct(m)}. Moderado: desde ${pct(m)} hasta menos de ${pct(a)}. Alto: ${pct(a)} o más.`,
  },
  actividadZona: {
    indicador: 'los sismos esperados en el primer mes del pronóstico comparados con el promedio de los últimos 12 meses',
    umbrales: [1.0, 1.3],
    criterio: (m, a) =>
      `Bajo: ${m === 1 ? 'igual o menos que el promedio' : `hasta ${pct(m - 1)} más que el promedio`}. ` +
      `Moderado: hasta ${pct(a - 1)} más que el promedio. Alto: más de ${pct(a - 1)} por encima del promedio.`,
  },
  amenaza: {
    indicador: 'la probabilidad de al menos un sismo de magnitud 6 o mayor en 10 años',
    umbrales: [0.1, 0.5],
    criterio: (m, a) => `Bajo: menos de ${pct(m)}. Moderado: desde ${pct(m)} hasta menos de ${pct(a)}. Alto: ${pct(a)} o más.`,
  },
} as const satisfies Record<string, ReglaSemaforo>;

export type IndicadorSemaforo = keyof typeof SEMAFORO;

/** Niveles que ya vienen como categoría (impacto y advertencias). */
export const SEMAFORO_IMPACTO: Record<NivelImpacto, NivelSemaforo> = {
  SIN_AFECTACION: 'BAJO',
  BAJO: 'BAJO',
  MODERADO: 'MODERADO',
  ALTO: 'ALTO',
};
export const EXPLICACION_IMPACTO =
  'Bajo: sin daños o con daños leves esperados. Moderado: posibles heridos o algunas viviendas destruidas. Alto: posibles víctimas o muchas viviendas destruidas.';

export const SEMAFORO_ADVERTENCIA: Record<NivelAdvertencia, NivelSemaforo> = {
  NORMAL: 'BAJO',
  ELEVADA: 'MODERADO',
  ALTA: 'ALTO',
};
export const EXPLICACION_ADVERTENCIA =
  'Bajo: ninguna zona tiene más sismos de lo normal. Moderado: al menos una zona tiene actividad elevada. Alto: al menos una zona tiene actividad muy por encima de lo normal.';

export function nivelSemaforo(indicador: IndicadorSemaforo, valor: number): NivelSemaforo {
  const [moderado, alto] = SEMAFORO[indicador].umbrales;
  // Actividad: «igual al promedio» todavía es bajo; en las probabilidades el umbral ya es moderado.
  const superaModerado = indicador === 'actividadZona' ? valor > moderado : valor >= moderado;
  if (indicador === 'actividadZona' ? valor > alto : valor >= alto) return 'ALTO';
  return superaModerado ? 'MODERADO' : 'BAJO';
}

export function explicacionSemaforo(indicador: IndicadorSemaforo): string {
  const r: ReglaSemaforo = SEMAFORO[indicador];
  return `Se mide con ${r.indicador}. ${r.criterio(...r.umbrales)}`;
}
