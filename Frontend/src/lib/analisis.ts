import type { GutenbergRichter, MannKendall } from '@/api/tipos';
import { UMBRAL_MAGNITUD_FUERTE, UMBRAL_MAGNITUD_MODERADA } from './escalasColor';

/* ---------- Gutenberg-Richter ---------- */

/**
 * log10 del número ACUMULADO TOTAL esperado (sobre todo el periodo del catálogo).
 * El `a` del contrato es anual: log10 N_anual = a − b·M, por lo que sobre
 * `anios` años: log10 N_total = a + log10(anios) − b·M.
 */
export function log10NTotal(a: number, b: number, anios: number, magnitud: number): number {
  return a + Math.log10(anios) - b * magnitud;
}

export function nTotalEsperado(a: number, b: number, anios: number, magnitud: number): number {
  return 10 ** log10NTotal(a, b, anios, magnitud);
}

export interface PuntoRecta {
  magnitud: number;
  n: number;
}

/**
 * Extremos de la recta ajustada para dibujarla desde Mc hasta la magnitud máxima,
 * sobre conteos totales (coherente con los puntos acumulados).
 */
export function rectaGutenbergRichter(
  gr: Pick<GutenbergRichter, 'a' | 'b' | 'anios' | 'mc'>,
  magnitudMaxima: number,
): [PuntoRecta, PuntoRecta] {
  const desde = gr.mc;
  const hasta = Math.max(magnitudMaxima, gr.mc);
  return [
    { magnitud: desde, n: nTotalEsperado(gr.a, gr.b, gr.anios, desde) },
    { magnitud: hasta, n: nTotalEsperado(gr.a, gr.b, gr.anios, hasta) },
  ];
}

/** Probabilidad de Poisson de al menos un evento ≥ M en t años: 1 − exp(−10^(a−bM)·t). */
export function probabilidadPoisson(a: number, b: number, magnitud: number, anios: number): number {
  return 1 - Math.exp(-(10 ** (a - b * magnitud)) * anios);
}

/* ---------- Mann-Kendall / Sen ---------- */

/** Valor de la recta de Sen en el índice de mes t (t = 0 para el primer mes). */
export function valorSen(mk: Pick<MannKendall, 'interceptoSen' | 'pendienteSen'>, t: number): number {
  return mk.interceptoSen + mk.pendienteSen * t;
}

export const ETIQUETAS_TENDENCIA: Record<MannKendall['tendencia'], string> = {
  CRECIENTE: 'Creciente',
  DECRECIENTE: 'Decreciente',
  SIN_TENDENCIA: 'Sin tendencia',
};

/* ---------- Señales del ESP32 ---------- */

export interface EstadoSenales {
  verde: boolean;
  amarillo: boolean;
  rojo: boolean;
  vibracion: boolean;
  buzzer: boolean;
}

/** Igual que en el firmware: verde siempre; amarillo y vibración ≥ 4; rojo y buzzer ≥ 6. */
export function senalesPorMagnitud(magnitud: number): EstadoSenales {
  const moderada = magnitud >= UMBRAL_MAGNITUD_MODERADA;
  const fuerte = magnitud >= UMBRAL_MAGNITUD_FUERTE;
  return { verde: true, amarillo: moderada, rojo: fuerte, vibracion: moderada, buzzer: fuerte };
}
