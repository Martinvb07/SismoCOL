import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { aNumero } from './sismos.serializar.js';

// Bins del histograma de 0,5 en décimas de magnitud (la columna es DECIMAL(3,1)).
const ANCHO_BIN_DECIMAS = 5;
const MAX_PUNTOS = 5000;

interface Conteo {
  valor: number;
  total: number;
}

/** Mediana a partir de conteos por valor distinto (evita traer todas las filas). */
export function medianaDeConteos(conteos: Conteo[]): number | null {
  const n = conteos.reduce((suma, c) => suma + c.total, 0);
  if (n === 0) return null;
  const ordenados = [...conteos].sort((a, b) => a.valor - b.valor);
  const valorEn = (posicion: number) => {
    let acumulado = 0;
    for (const c of ordenados) {
      acumulado += c.total;
      if (posicion < acumulado) return c.valor;
    }
    return ordenados[ordenados.length - 1]!.valor;
  };
  const medio = Math.floor(n / 2);
  return n % 2 ? valorEn(medio) : (valorEn(medio - 1) + valorEn(medio)) / 2;
}

/** Bins de 0,5 contiguos desde el de la magnitud mínima hasta el de la máxima: [desde, hasta). */
export function histogramaDeConteos(conteos: Conteo[]) {
  if (conteos.length === 0) return [];
  const porBin = new Map<number, number>();
  for (const { valor, total } of conteos) {
    const bin = Math.floor(Math.round(valor * 10) / ANCHO_BIN_DECIMAS);
    porBin.set(bin, (porBin.get(bin) ?? 0) + total);
  }
  const bins = [...porBin.keys()];
  const histograma = [];
  for (let bin = Math.min(...bins); bin <= Math.max(...bins); bin++) {
    histograma.push({
      desde: (bin * ANCHO_BIN_DECIMAS) / 10,
      hasta: ((bin + 1) * ANCHO_BIN_DECIMAS) / 10,
      total: porBin.get(bin) ?? 0,
    });
  }
  return histograma;
}

export async function calcularEstadisticas(where: Prisma.RegistroSismicoWhereInput) {
  const [agregado, porDepartamento, porMagnitud, porProfundidad, puntos] = await Promise.all([
    prisma.registroSismico.aggregate({
      where,
      _count: { _all: true },
      _max: { magnitud: true, fechaHora: true },
      _min: { fechaHora: true },
    }),
    prisma.registroSismico.groupBy({
      by: ['departamento'],
      where: { AND: [where, { departamento: { not: null } }] },
      _count: { _all: true },
      _max: { magnitud: true },
    }),
    prisma.registroSismico.groupBy({
      by: ['magnitud'],
      where: { AND: [where, { magnitud: { not: null } }] },
      _count: { _all: true },
    }),
    prisma.registroSismico.groupBy({
      by: ['profundidadKm'],
      where: { AND: [where, { profundidadKm: { not: null } }] },
      _count: { _all: true },
    }),
    prisma.registroSismico.findMany({
      where: {
        AND: [where, { latitud: { not: null } }, { longitud: { not: null } }, { magnitud: { not: null } }, { profundidadKm: { not: null } }],
      },
      select: {
        idSismo: true,
        latitud: true,
        longitud: true,
        magnitud: true,
        profundidadKm: true,
        fechaHora: true,
        municipio: true,
      },
      orderBy: [{ magnitud: 'desc' }, { idSismo: 'asc' }],
      take: MAX_PUNTOS,
    }),
  ]);

  const conteos = (filas: Array<{ _count: { _all: number } } & Record<string, unknown>>, campo: string): Conteo[] =>
    filas.map((f) => ({ valor: aNumero(f[campo] as Prisma.Decimal) as number, total: f._count._all }));

  return {
    total: agregado._count._all,
    magnitudMax: aNumero(agregado._max.magnitud),
    profundidadMediana: medianaDeConteos(conteos(porProfundidad, 'profundidadKm')),
    rango: {
      desde: agregado._min.fechaHora?.toISOString() ?? null,
      hasta: agregado._max.fechaHora?.toISOString() ?? null,
    },
    porDepartamento: porDepartamento
      .map((d) => ({
        departamento: d.departamento as string,
        total: d._count._all,
        magnitudMax: aNumero(d._max.magnitud) ?? 0,
      }))
      .sort((a, b) => b.total - a.total || a.departamento.localeCompare(b.departamento, 'es')),
    histograma: histogramaDeConteos(conteos(porMagnitud, 'magnitud')),
    puntos: puntos.map((p) => ({
      idSismo: p.idSismo,
      latitud: aNumero(p.latitud) as number,
      longitud: aNumero(p.longitud) as number,
      magnitud: aNumero(p.magnitud) as number,
      profundidadKm: aNumero(p.profundidadKm) as number,
      fechaHora: p.fechaHora.toISOString(),
      municipio: p.municipio,
    })),
  };
}
