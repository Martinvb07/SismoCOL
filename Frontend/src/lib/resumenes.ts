/**
 * Frases «En palabras simples» y títulos-conclusión de las gráficas, generados a
 * partir de los datos. Sin siglas ni jerga: van dirigidos a quien no sabe estadística.
 */
import type {
  Advertencia,
  CuerpoPrediccion,
  NivelImpacto,
  PronosticoActividad,
  PronosticoReplicas,
  PuntoCurvaReplicas,
  RespuestaEscenario,
  RespuestaPrediccion,
  Tendencia,
  ZonaPeriodoRetorno,
} from '@/api/tipos';
import { LOCALE } from '@/config';
import { formatearFechaLarga, formatearNumero, formatearPorcentaje } from '@/lib/formato';
import {
  nivelSemaforo,
  SEMAFORO_ADVERTENCIA,
  SEMAFORO_IMPACTO,
  type NivelSemaforo,
} from '@/umbralesSemaforo';

export interface Resumen {
  texto: string;
  nivel: NivelSemaforo;
}

const ORDEN_SEMAFORO: readonly NivelSemaforo[] = ['BAJO', 'MODERADO', 'ALTO'];
const formatoMesLargo = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** 0,35 → "35 %"; los extremos se dicen con palabras para no sugerir certeza. */
export function porcentajeSimple(p: number): string {
  if (p < 0.01) return 'menos de 1 %';
  if (p > 0.99) return 'más de 99 %';
  return formatearPorcentaje(p, 0);
}

export function unirLista(elementos: string[]): string {
  if (elementos.length <= 1) return elementos[0] ?? '';
  return `${elementos.slice(0, -1).join(', ')} y ${elementos[elementos.length - 1]}`;
}

/** 'AAAA-MM' → "agosto de 2026". */
export function mesLargo(mes: string): string {
  const texto = formatoMesLargo.format(new Date(`${mes}-01T00:00:00Z`));
  return / de \d{4}$/.test(texto) ? texto : texto.replace(/ (\d{4})$/, ' de $1');
}

function peor(niveles: NivelSemaforo[]): NivelSemaforo {
  return niveles.reduce<NivelSemaforo>((a, b) => (ORDEN_SEMAFORO.indexOf(b) > ORDEN_SEMAFORO.indexOf(a) ? b : a), 'BAJO');
}

function cantidadReplicas([desde, hasta]: [number, number], magnitud: number): string {
  const que = `réplicas de magnitud ${magnitud} o mayor`;
  if (hasta === 0) return `lo más probable es que no ocurra ninguna de las ${que}`;
  if (desde === hasta) return `lo más probable es que ocurran unas ${desde} ${que}`;
  if (desde === 0) return `lo más probable es que ocurran como máximo ${hasta} ${que}`;
  return `lo más probable es que ocurran entre ${desde} y ${hasta} ${que}`;
}

/* ---------- Réplicas ---------- */

export function resumenReplicas(p: PronosticoReplicas): Resumen {
  const siete = p.resultados.horizontes.find((h) => h.horizonte === '7d');
  const m5 = siete?.magnitudes.find((m) => m.magnitud === 5);
  const m4 = siete?.magnitudes.find((m) => m.magnitud === 4);
  if (!siete || !m5 || !m4) return { texto: 'No hay suficiente información para estimar las réplicas de este sismo.', nivel: 'BAJO' };
  const texto =
    `En los próximos 7 días, contados desde el ${formatearFechaLarga(p.parametros.datosHasta)} (último dato disponible), ` +
    `hay ${porcentajeSimple(m5.probabilidad)} de probabilidad de al menos una réplica de magnitud 5 o mayor; ` +
    `${cantidadReplicas(m4.ic95, 4)}.`;
  return { texto, nivel: nivelSemaforo('replicas', m5.probabilidad) };
}

export function tituloCurvaReplicas(curva: PuntoCurvaReplicas[]): string {
  const observados = curva.filter((c) => c.observado !== null);
  const ultimo = observados[observados.length - 1];
  if (!ultimo || ultimo.observado === 0) return 'Casi no se han registrado réplicas de este sismo';
  if ((ultimo.observado ?? 0) > ultimo.superior) return 'Hubo más réplicas de las que el modelo esperaba';
  if ((ultimo.observado ?? 0) < ultimo.inferior) return 'Hubo menos réplicas de las que el modelo esperaba';
  return 'Las réplicas disminuyen rápido después del sismo';
}

/* ---------- Pronóstico de actividad por zona ---------- */

export function resumenPronosticoZona(p: PronosticoActividad): Resumen {
  const primero = p.pronostico[0];
  if (!primero) return { texto: 'No hay pronóstico para esta zona.', nivel: 'BAJO' };
  const ultimos = p.serie.slice(-12);
  const promedio = ultimos.reduce((a, s) => a + s.eventos, 0) / Math.max(ultimos.length, 1);
  const donde = p.zona === 'Colombia' ? 'En todo el país' : `Para ${p.zona}`;
  const valor = Math.round(primero.valor);
  const rango = `entre ${Math.round(primero.inferior80)} y ${Math.round(primero.superior80)}`;
  const razon = promedio > 0 ? primero.valor / promedio : 1;
  const comparacion =
    razon > 1.05 ? 'más de lo habitual' : razon < 0.95 ? 'menos de lo habitual' : 'parecido a lo habitual';
  const texto =
    `${donde} se esperan unos ${valor} sismos de magnitud ${formatearNumero(p.mc, 1)} o mayor en ${mesLargo(primero.mes)}, ` +
    `el primer mes después de los datos disponibles (lo más probable, ${rango}). ` +
    `Es ${comparacion}: en los últimos 12 meses hubo en promedio ${Math.round(promedio)} al mes.`;
  return { texto, nivel: nivelSemaforo('actividadZona', razon) };
}

export function tituloPronosticoZona(p: PronosticoActividad): string {
  const media = p.pronostico.reduce((a, x) => a + x.valor, 0) / Math.max(p.pronostico.length, 1);
  return `Se esperan unos ${Math.round(media)} sismos por mes en los próximos 12 meses`;
}

/* ---------- Periodo de retorno y amenaza ---------- */

export function cadaCuanto(periodoAnios: number): string {
  if (periodoAnios < 0.75) return `unas ${Math.round(1 / periodoAnios)} veces al año`;
  if (periodoAnios < 1.5) return 'aproximadamente una vez al año';
  if (periodoAnios >= 1000) return 'menos de una vez cada mil años';
  return `cada ${formatearNumero(periodoAnios, 0)} años`;
}

function nombreRegion(region: string): string {
  return region.replace(/^Región /, 'la región ');
}

export function resumenAmenazaZona(z: ZonaPeriodoRetorno): Resumen {
  const m6 = z.magnitudes.find((m) => m.magnitud === 6);
  if (!m6) return { texto: `No hay datos suficientes para ${z.zona}.`, nivel: 'BAJO' };
  const donde = z.agrupadaEn ? `En ${z.zona} (calculado con toda ${nombreRegion(z.agrupadaEn)}, por tener pocos datos propios)` : `En ${z.zona}`;
  const texto =
    `${donde} se espera en promedio un sismo de magnitud 6 o más ${cadaCuanto(m6.periodoRetorno)}. ` +
    `La probabilidad de que ocurra al menos uno en los próximos 10 años es de ${porcentajeSimple(m6.probabilidades.anios10)}.`;
  return { texto, nivel: nivelSemaforo('amenaza', m6.probabilidades.anios10) };
}

/** Zonas (o regiones, si están agrupadas) con mayor probabilidad de un M ≥ 6 en 10 años. */
export function zonasMasAmenazadas(zonas: ZonaPeriodoRetorno[], cuantas = 2): Array<{ nombre: string; probabilidad: number }> {
  const vistos = new Map<string, number>();
  for (const z of zonas) {
    const p = z.magnitudes.find((m) => m.magnitud === 6)?.probabilidades.anios10;
    if (p === undefined) continue;
    const nombre = z.agrupadaEn ? nombreRegion(z.agrupadaEn).replace(/^la región/, 'Región') : z.zona;
    vistos.set(nombre, Math.max(vistos.get(nombre) ?? 0, p));
  }
  return [...vistos.entries()]
    .map(([nombre, probabilidad]) => ({ nombre, probabilidad }))
    .sort((a, b) => b.probabilidad - a.probabilidad)
    .slice(0, cuantas);
}

export function tituloMapaAmenaza(zonas: ZonaPeriodoRetorno[]): string {
  const top = zonasMasAmenazadas(zonas).map((z) => z.nombre);
  return top.length ? `${unirLista(top)} concentran la mayor probabilidad de un sismo fuerte` : 'Dónde es más probable un sismo fuerte';
}

/* ---------- Predicción de impacto y escenarios ---------- */

export function intensidadEnPalabras(mmi: number): string {
  if (mmi < 2) return 'no se sentiría';
  if (mmi < 4) return 'se sentiría débil';
  if (mmi < 5) return 'se sentiría ligera';
  if (mmi < 6) return 'se sentiría moderada';
  if (mmi < 7) return 'se sentiría fuerte';
  if (mmi < 8) return 'se sentiría muy fuerte';
  if (mmi < 9) return 'sería severa';
  return 'sería violenta';
}

const IMPACTO_EN_PALABRAS: Record<NivelImpacto, string> = {
  SIN_AFECTACION: 'que no haya afectación',
  BAJO: 'un impacto bajo',
  MODERADO: 'un impacto moderado',
  ALTO: 'un impacto alto',
};

export function resumenPrediccion(r: RespuestaPrediccion, e: CuerpoPrediccion): Resumen {
  const lugar = r.municipio ? `cerca de ${r.municipio.nombre} (${r.municipio.departamento})` : 'en el punto elegido';
  let texto =
    `Si ocurriera un sismo de magnitud ${formatearNumero(e.magnitud, 1)} a ${formatearNumero(e.profundidadKm)} km de profundidad ${lugar}, ` +
    `lo más probable es ${IMPACTO_EN_PALABRAS[r.nivelImpacto]} en ese municipio (probabilidad de ${porcentajeSimple(r.probabilidad)}).`;
  if (r.intensidadMmi !== null && r.intensidadMmi !== undefined) texto += ` Allí la sacudida ${intensidadEnPalabras(r.intensidadMmi)}.`;
  return { texto, nivel: SEMAFORO_IMPACTO[r.nivelImpacto] };
}

export function resumenEscenario(r: RespuestaEscenario): Resumen {
  const n = r.municipios.length;
  if (n === 0) return { texto: 'Con un sismo así, ningún municipio sentiría una sacudida apreciable.', nivel: 'BAJO' };
  const cuenta = (nivel: NivelImpacto) => r.municipios.filter((m) => m.nivelImpacto === nivel).length;
  const [alto, moderado, bajo] = [cuenta('ALTO'), cuenta('MODERADO'), cuenta('BAJO')];
  const mas = [...r.municipios].sort((a, b) => b.intensidadMmi - a.intensidadMmi)[0];
  const partes = (
    [
      [alto, 'impacto alto'],
      [moderado, 'impacto moderado'],
      [bajo, 'impacto bajo'],
    ] as const
  )
    .filter(([cuantos]) => cuantos > 0)
    .map(([cuantos, que]) => `${cuantos} con ${que}`);
  const detalle = partes.length ? `${unirLista(partes)}; el resto, sin afectación` : 'en ninguno se esperan daños';
  const texto =
    `Con un sismo así, ${n} ${n === 1 ? 'municipio sentiría' : 'municipios sentirían'} la sacudida: ${detalle}. ` +
    (mas ? `La sacudida más fuerte se sentiría en ${mas.municipio} (${mas.departamento}).` : '');
  return { texto, nivel: peor(r.municipios.map((m) => SEMAFORO_IMPACTO[m.nivelImpacto])) };
}

/* ---------- Análisis y advertencias ---------- */

const TENDENCIA_EN_PALABRAS: Record<Tendencia, string> = {
  CRECIENTE: 'viene aumentando',
  DECRECIENTE: 'viene disminuyendo',
  SIN_TENDENCIA: 'no muestra un cambio claro',
};

export function resumenAdvertencias(advertencias: Advertencia[], fechaCorte: string | null, zona?: { nombre: string; tendencia: Tendencia }): Resumen {
  const activas = advertencias.filter((a) => a.nivel !== 'NORMAL');
  const desde = fechaCorte ? `Con los datos hasta el ${formatearFechaLarga(fechaCorte)}, ` : '';
  let texto =
    activas.length === 0
      ? `${desde}ninguna zona tiene más sismos de lo normal.`
      : `${desde}${activas.length === 1 ? 'una zona tiene' : `${activas.length} zonas tienen`} más sismos de lo normal: ${unirLista(activas.map((a) => a.zona))}.`;
  if (zona) texto += ` En ${zona.nombre}, la cantidad de sismos por mes ${TENDENCIA_EN_PALABRAS[zona.tendencia]}.`;
  return { texto, nivel: peor(advertencias.map((a) => SEMAFORO_ADVERTENCIA[a.nivel])) };
}

export function tituloTendencia(zona: string, tendencia: Tendencia): string {
  const verbo = { CRECIENTE: 'aumentan', DECRECIENTE: 'disminuyen', SIN_TENDENCIA: 'se mantienen sin un cambio claro' }[tendencia];
  return `En ${zona}, los sismos por mes ${verbo}`;
}
