import type { NivelAdvertencia, NivelImpacto } from '@/api/tipos';

/**
 * Único módulo con la semántica verde / amarillo / rojo.
 * Solo se usa para magnitud, nivel de impacto y advertencias; el resto de la
 * interfaz usa los tokens de marca. Cada color va siempre con una etiqueta de texto.
 */

export const COLORES_ESTADO = {
  verde: { relleno: '#2e9e5b', fondo: '#e3f4ea', texto: '#1d6b3c', borde: '#9fd6b5' },
  amarillo: { relleno: '#e2b007', fondo: '#fdf5d8', texto: '#7a5d00', borde: '#f0d77a' },
  naranja: { relleno: '#e7792b', fondo: '#fde9da', texto: '#8f4410', borde: '#f3b88c' },
  rojo: { relleno: '#d23c3c', fondo: '#fbe3e3', texto: '#931f1f', borde: '#eea3a3' },
  neutro: { relleno: '#9aa7ad', fondo: '#eef1f3', texto: '#4a5a61', borde: '#cfd7db' },
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
