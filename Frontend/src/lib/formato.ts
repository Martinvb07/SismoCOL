import { LOCALE, ZONA_HORARIA } from '@/config';

/** Formateadores es-CO con hora de Colombia. Las fechas de la API vienen en UTC ISO. */

const formatoFechaHora = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const formatoFecha = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});

const formatoFechaLarga = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const formatoMes = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', year: 'numeric', month: 'short' });

const formatoIsoBogota = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const SIN_DATO = '—';

function aFecha(valor: string | Date | null | undefined): Date | null {
  if (valor === null || valor === undefined) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function formatearFechaHora(valor: string | Date | null | undefined): string {
  const fecha = aFecha(valor);
  return fecha ? formatoFechaHora.format(fecha) : SIN_DATO;
}

export function formatearFecha(valor: string | Date | null | undefined): string {
  const fecha = aFecha(valor);
  return fecha ? formatoFecha.format(fecha) : SIN_DATO;
}

export function formatearFechaLarga(valor: string | Date | null | undefined): string {
  const fecha = aFecha(valor);
  return fecha ? formatoFechaLarga.format(fecha) : SIN_DATO;
}

/** 'YYYY-MM' → "ene. 2024" (sin desfase de zona horaria). */
export function formatearMes(mes: string): string {
  const fecha = aFecha(`${mes}-01T00:00:00Z`);
  return fecha ? formatoMes.format(fecha) : mes;
}

/** Fecha actual (u otra) como YYYY-MM-DD en hora de Colombia. */
export function fechaIsoBogota(valor: Date = new Date()): string {
  return formatoIsoBogota.format(valor);
}

const cacheNumeros = new Map<string, Intl.NumberFormat>();
function formateador(minimo: number, maximo: number, estilo: 'decimal' | 'percent' = 'decimal'): Intl.NumberFormat {
  const clave = `${estilo}-${minimo}-${maximo}`;
  let f = cacheNumeros.get(clave);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      style: estilo,
      minimumFractionDigits: minimo,
      maximumFractionDigits: maximo,
    });
    cacheNumeros.set(clave, f);
  }
  return f;
}

/** Número con formato es-CO (coma decimal, punto de miles). */
export function formatearNumero(valor: number | null | undefined, decimales = 0): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return SIN_DATO;
  return formateador(decimales, decimales).format(valor);
}

export function formatearEntero(valor: number | null | undefined): string {
  return formatearNumero(valor, 0);
}

/** Proporción 0–1 → porcentaje es-CO. */
export function formatearPorcentaje(valor: number | null | undefined, decimales = 1): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return SIN_DATO;
  return formateador(decimales, decimales, 'percent').format(valor);
}

export function formatearMagnitud(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? SIN_DATO : `M ${formatearNumero(valor, 1)}`;
}

export function formatearProfundidad(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? SIN_DATO : `${formatearNumero(valor, 1)} km`;
}

/** p-valor: notación compacta para valores muy pequeños. */
export function formatearPValor(valor: number): string {
  const UMBRAL_NOTACION = 0.001;
  if (valor < UMBRAL_NOTACION) return '< 0,001';
  return formatearNumero(valor, 3);
}

export function formatearBytes(bytes: number): string {
  const KB = 1024;
  const MB = KB * KB;
  if (bytes >= MB) return `${formatearNumero(bytes / MB, 1)} MB`;
  if (bytes >= KB) return `${formatearNumero(bytes / KB, 0)} kB`;
  return `${formatearEntero(bytes)} B`;
}

export { SIN_DATO };
