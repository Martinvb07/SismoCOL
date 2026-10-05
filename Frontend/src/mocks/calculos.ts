/** Cálculos que el servicio analítico hace de verdad, simplificados para los mocks. */
import type { Estadisticas, Frecuencia, GutenbergRichter, MannKendall, Sismo } from '@/api/tipos';
import { fechaIsoBogota } from '@/lib/formato';
import { FECHA_CORTE, regionDeZona, SISMOS } from './datos';

const ANCHO_BIN = 0.5;
const MAX_PUNTOS = 5000;
const ALFA = 0.05;
const MS_POR_ANIO = 365.25 * 24 * 3600 * 1000;
const PASO_MAGNITUD = 0.1;

export function filtrarSismos(params: URLSearchParams): Sismo[] {
  const num = (clave: string) => {
    const v = params.get(clave);
    return v === null || v === '' ? null : Number(v);
  };
  const desde = params.get('desde');
  const hasta = params.get('hasta');
  const departamento = params.get('departamento');
  const fuente = params.get('fuente');
  const incluirAnomalos = params.get('incluirAnomalos') === 'true';
  const magMin = num('magMin');
  const magMax = num('magMax');
  const profMin = num('profMin');
  const profMax = num('profMax');

  return SISMOS.filter((s) => {
    if (!incluirAnomalos && s.esAnomalo) return false;
    const dia = fechaIsoBogota(new Date(s.fechaHora));
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    if (departamento && s.departamento !== departamento) return false;
    if (fuente && s.fuente !== fuente) return false;
    if (magMin !== null && (s.magnitud === null || s.magnitud < magMin)) return false;
    if (magMax !== null && (s.magnitud === null || s.magnitud > magMax)) return false;
    if (profMin !== null && (s.profundidadKm === null || s.profundidadKm < profMin)) return false;
    if (profMax !== null && (s.profundidadKm === null || s.profundidadKm > profMax)) return false;
    return true;
  });
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? (orden[medio] as number) : ((orden[medio - 1] as number) + (orden[medio] as number)) / 2;
}

export function calcularEstadisticas(lista: Sismo[]): Estadisticas {
  const magnitudes = lista.map((s) => s.magnitud).filter((m): m is number => m !== null);
  const profundidades = lista.map((s) => s.profundidadKm).filter((p): p is number => p !== null);
  const fechas = lista.map((s) => s.fechaHora).sort();

  const porDep = new Map<string, { total: number; magnitudMax: number }>();
  for (const s of lista) {
    if (!s.departamento) continue;
    const actual = porDep.get(s.departamento) ?? { total: 0, magnitudMax: 0 };
    actual.total += 1;
    actual.magnitudMax = Math.max(actual.magnitudMax, s.magnitud ?? 0);
    porDep.set(s.departamento, actual);
  }

  const histograma: Estadisticas['histograma'] = [];
  if (magnitudes.length > 0) {
    const inicio = Math.floor(Math.min(...magnitudes) / ANCHO_BIN) * ANCHO_BIN;
    const fin = Math.floor(Math.max(...magnitudes) / ANCHO_BIN) * ANCHO_BIN + ANCHO_BIN;
    for (let d = inicio; d < fin - 1e-9; d += ANCHO_BIN) {
      const desde = Number(d.toFixed(1));
      const hasta = Number((d + ANCHO_BIN).toFixed(1));
      histograma.push({ desde, hasta, total: magnitudes.filter((m) => m >= desde && m < hasta).length });
    }
  }

  const puntos = lista
    .filter((s) => s.latitud !== null && s.longitud !== null && s.magnitud !== null && s.profundidadKm !== null)
    .sort((a, b) => (b.magnitud ?? 0) - (a.magnitud ?? 0))
    .slice(0, MAX_PUNTOS)
    .map((s) => ({
      idSismo: s.idSismo,
      latitud: s.latitud as number,
      longitud: s.longitud as number,
      magnitud: s.magnitud as number,
      profundidadKm: s.profundidadKm as number,
      fechaHora: s.fechaHora,
      municipio: s.municipio,
    }));

  return {
    total: lista.length,
    magnitudMax: magnitudes.length ? Math.max(...magnitudes) : null,
    profundidadMediana: mediana(profundidades),
    rango: { desde: fechas[0] ?? null, hasta: fechas[fechas.length - 1] ?? null },
    porDepartamento: [...porDep.entries()]
      .map(([departamento, v]) => ({ departamento, ...v }))
      .sort((a, b) => b.total - a.total),
    histograma,
    puntos,
  };
}

/** Sismos SGC válidos de una zona (o de su región si está agrupada). */
export function sismosDeZona(zona: string, agrupadaEn: string | null): Sismo[] {
  return SISMOS.filter(
    (s) => s.fuente === 'SGC' && !s.esAnomalo && s.zona !== null && (agrupadaEn ? regionDeZona(s.zona) === agrupadaEn : s.zona === zona),
  );
}

/* ---------- Mann-Kendall ---------- */

/** Aproximación de la CDF normal estándar (Abramowitz-Stegun 26.2.17). */
function cdfNormal(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function mannKendall(x: number[]): MannKendall {
  const n = x.length;
  let s = 0;
  const pendientes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const dif = (x[j] as number) - (x[i] as number);
      s += Math.sign(dif);
      pendientes.push(dif / (j - i));
    }
  }
  const pares = (n * (n - 1)) / 2;
  const varianza = (n * (n - 1) * (2 * n + 5)) / 18;
  const z = s > 0 ? (s - 1) / Math.sqrt(varianza) : s < 0 ? (s + 1) / Math.sqrt(varianza) : 0;
  const pValor = 2 * (1 - cdfNormal(Math.abs(z)));
  const pendienteSen = mediana(pendientes) ?? 0;
  const interceptoSen = mediana(x.map((v, t) => v - pendienteSen * t)) ?? 0;
  const significativa = pValor < ALFA;
  return {
    tau: pares > 0 ? s / pares : 0,
    pValor,
    pendienteSen,
    interceptoSen,
    alfa: ALFA,
    significativa,
    tendencia: !significativa ? 'SIN_TENDENCIA' : s > 0 ? 'CRECIENTE' : 'DECRECIENTE',
  };
}

export function calcularFrecuencia(zona: string, agrupadaEn: string | null): Frecuencia {
  const lista = sismosDeZona(zona, agrupadaEn);
  const conteo = new Map<string, number>();
  for (const s of lista) {
    const mes = fechaIsoBogota(new Date(s.fechaHora)).slice(0, 7);
    conteo.set(mes, (conteo.get(mes) ?? 0) + 1);
  }
  // Meses consecutivos desde el primero hasta el de corte
  const meses: string[] = [];
  const primero = [...conteo.keys()].sort()[0] ?? FECHA_CORTE.slice(0, 7);
  const [anioIni, mesIni] = primero.split('-').map(Number) as [number, number];
  const ultimo = fechaIsoBogota(new Date(FECHA_CORTE)).slice(0, 7);
  for (let a = anioIni, m = mesIni; ; ) {
    const clave = `${a}-${String(m).padStart(2, '0')}`;
    meses.push(clave);
    if (clave >= ultimo) break;
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  const VENTANA_MEDIA = 12;
  const eventos = meses.map((mes) => conteo.get(mes) ?? 0);
  const serieMensual = meses.map((mes, i) => ({
    mes,
    eventos: eventos[i] as number,
    mediaMovil12:
      i >= VENTANA_MEDIA - 1 ? Number((eventos.slice(i - VENTANA_MEDIA + 1, i + 1).reduce((a, b) => a + b, 0) / VENTANA_MEDIA).toFixed(2)) : null,
  }));
  return { zona, agrupadaEn, fechaCorte: FECHA_CORTE, serieMensual, mannKendall: mannKendall(eventos) };
}

/* ---------- Gutenberg-Richter ---------- */

export function calcularGR(zona: string, agrupadaEn: string | null): GutenbergRichter {
  const lista = sismosDeZona(zona, agrupadaEn);
  const mags = lista.map((s) => s.magnitud).filter((m): m is number => m !== null);
  const fechas = lista.map((s) => Date.parse(s.fechaHora));
  const anios = fechas.length ? Math.max((Math.max(...fechas) - Math.min(...fechas)) / MS_POR_ANIO, PASO_MAGNITUD) : 1;

  // Conteo incremental por bin de 0,1
  const incremental = new Map<number, number>();
  for (const m of mags) {
    const bin = Number((Math.round(m / PASO_MAGNITUD) * PASO_MAGNITUD).toFixed(1));
    incremental.set(bin, (incremental.get(bin) ?? 0) + 1);
  }
  const bins = [...incremental.keys()].sort((a, b) => a - b);
  // Mc por máxima curvatura (+0,2 de corrección habitual)
  let modo = bins[0] ?? 0;
  for (const b of bins) if ((incremental.get(b) ?? 0) > (incremental.get(modo) ?? 0)) modo = b;
  const mc = Number((modo + 0.2).toFixed(1));

  const sobreMc = mags.filter((m) => m >= mc - 1e-9);
  const media = sobreMc.reduce((a, b) => a + b, 0) / Math.max(sobreMc.length, 1);
  // Aki-Utsu con corrección de bin
  const b = Math.LOG10E / Math.max(media - (mc - PASO_MAGNITUD / 2), 0.05);
  const n = sobreMc.length;
  // Shi-Bolt
  const sumaCuadrados = sobreMc.reduce((acc, m) => acc + (m - media) ** 2, 0);
  const errorB = n > 1 ? 2.3 * b * b * Math.sqrt(sumaCuadrados / (n * (n - 1))) : 0;
  const tasaAnual = n / anios;
  const a = Math.log10(Math.max(tasaAnual, 1e-9)) + b * mc;

  let acumulado = mags.length;
  const puntos = bins.map((bin) => {
    const inc = incremental.get(bin) ?? 0;
    const punto = { magnitud: bin, acumulado, incremental: inc };
    acumulado -= inc;
    return punto;
  });

  return {
    zona,
    agrupadaEn,
    fechaCorte: FECHA_CORTE,
    mc,
    a: Number(a.toFixed(3)),
    b: Number(b.toFixed(3)),
    errorB: Number(errorB.toFixed(3)),
    nEventos: n,
    anios: Number(anios.toFixed(2)),
    tasaAnual: Number(tasaAnual.toFixed(2)),
    puntos,
  };
}
