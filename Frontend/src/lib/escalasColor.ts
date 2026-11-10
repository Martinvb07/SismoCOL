import type { NivelAdvertencia, NivelImpacto } from '@/api/tipos';

/**
 * Único módulo con la semántica verde / amarillo / rojo.
 * Solo se usa para magnitud, nivel de impacto y advertencias; el resto de la
 * interfaz usa los tokens de marca. Cada color va siempre con una etiqueta de texto.
 */

/** `relleno` es fijo (marcas de gráficas y mapas); fondo, texto y borde siguen el tema (variables en index.css). */
const conTema = <T extends string>(tono: T, relleno: string) =>
  ({ relleno, fondo: `var(--estado-${tono}-fondo)`, texto: `var(--estado-${tono}-texto)`, borde: `var(--estado-${tono}-borde)` }) as const;

export const COLORES_ESTADO = {
  verde: conTema('verde', '#2e9e5b'),
  amarillo: conTema('amarillo', '#e2b007'),
  naranja: conTema('naranja', '#e7792b'),
  rojo: conTema('rojo', '#d23c3c'),
  neutro: conTema('neutro', '#9aa7ad'),
} as const;

export type TonoEstado = keyof typeof COLORES_ESTADO;

export interface EstiloEstado {
  tono: TonoEstado;
  etiqueta: string;
  relleno: string;
  fondo: string;
  texto: string;
  borde: string;
}

function estilo(tono: TonoEstado, etiqueta: string): EstiloEstado {
  return { tono, etiqueta, ...COLORES_ESTADO[tono] };
}

/* ---------- Magnitud ---------- */

/** Umbrales compartidos con el firmware del ESP32 (amarillo ≥ 4, rojo ≥ 6). */
export const UMBRAL_MAGNITUD_MODERADA = 4;
export const UMBRAL_MAGNITUD_FUERTE = 6;

export type CategoriaMagnitud = 'LEVE' | 'MODERADA' | 'FUERTE';

export function categoriaMagnitud(magnitud: number): CategoriaMagnitud {
  if (magnitud >= UMBRAL_MAGNITUD_FUERTE) return 'FUERTE';
  if (magnitud >= UMBRAL_MAGNITUD_MODERADA) return 'MODERADA';
  return 'LEVE';
}

const ESTILOS_MAGNITUD: Record<CategoriaMagnitud, EstiloEstado> = {
  LEVE: estilo('verde', 'M < 4'),
  MODERADA: estilo('amarillo', '4 ≤ M < 6'),
  FUERTE: estilo('rojo', 'M ≥ 6'),
};

export function estiloMagnitud(magnitud: number | null | undefined): EstiloEstado {
  if (magnitud === null || magnitud === undefined || Number.isNaN(magnitud)) {
    return estilo('neutro', 'Sin magnitud');
  }
  return ESTILOS_MAGNITUD[categoriaMagnitud(magnitud)];
}

export function colorMagnitud(magnitud: number | null | undefined): string {
  return estiloMagnitud(magnitud).relleno;
}

/** Leyenda de la escala de magnitud (en orden ascendente). */
export const LEYENDA_MAGNITUD: readonly EstiloEstado[] = [
  ESTILOS_MAGNITUD.LEVE,
  ESTILOS_MAGNITUD.MODERADA,
  ESTILOS_MAGNITUD.FUERTE,
];

/* ---------- Nivel de impacto ---------- */

const ESTILOS_IMPACTO: Record<NivelImpacto, EstiloEstado> = {
  SIN_AFECTACION: estilo('verde', 'Sin afectación'),
  BAJO: estilo('amarillo', 'Bajo'),
  MODERADO: estilo('naranja', 'Moderado'),
  ALTO: estilo('rojo', 'Alto'),
};

export function estiloNivelImpacto(nivel: NivelImpacto | null | undefined): EstiloEstado {
  return nivel ? ESTILOS_IMPACTO[nivel] : estilo('neutro', 'Sin dato');
}

/* ---------- Nivel de advertencia ---------- */

const ESTILOS_ADVERTENCIA: Record<NivelAdvertencia, EstiloEstado> = {
  NORMAL: estilo('verde', 'Normal'),
  ELEVADA: estilo('amarillo', 'Elevada'),
  ALTA: estilo('rojo', 'Alta'),
};

export function estiloNivelAdvertencia(nivel: NivelAdvertencia): EstiloEstado {
  return ESTILOS_ADVERTENCIA[nivel];
}
