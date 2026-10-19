import { z } from 'zod';
import { FuenteDato, type Prisma } from '../../generated/prisma/client.js';

// Colombia no tiene horario de verano: siempre UTC−5.
const DESFASE_BOGOTA = '-05:00';
const MS_POR_DIA = 24 * 3600 * 1000;

const fecha = z.iso.date('Use el formato AAAA-MM-DD');
const numero = z.coerce.number();

/** Filtros comunes de docs/api-contrato.md (sección "Sismos y estadísticas"). */
export const esquemaFiltros = z
  .object({
    desde: fecha.optional(),
    hasta: fecha.optional(),
    departamento: z.string().trim().min(1).max(60).optional(),
    magMin: numero.min(0).max(10).optional(),
    magMax: numero.min(0).max(10).optional(),
    profMin: numero.min(-10).max(1000).optional(),
    profMax: numero.min(-10).max(1000).optional(),
    fuente: z.enum(FuenteDato).optional(),
    incluirAnomalos: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  })
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, { message: '"desde" no puede ser posterior a "hasta"', path: ['desde'] })
  .refine((f) => f.magMin === undefined || f.magMax === undefined || f.magMin <= f.magMax, {
    message: 'La magnitud mínima supera a la máxima',
    path: ['magMin'],
  })
  .refine((f) => f.profMin === undefined || f.profMax === undefined || f.profMin <= f.profMax, {
    message: 'La profundidad mínima supera a la máxima',
    path: ['profMin'],
  });

export type FiltrosSismos = z.infer<typeof esquemaFiltros>;

/** Medianoche de Bogotá del día dado, en UTC. */
function inicioDiaBogota(dia: string): Date {
  return new Date(`${dia}T00:00:00${DESFASE_BOGOTA}`);
}

export function construirWhere(f: FiltrosSismos): Prisma.RegistroSismicoWhereInput {
  const where: Prisma.RegistroSismicoWhereInput = {};
  if (!f.incluirAnomalos) where.esAnomalo = false;
  if (f.desde || f.hasta) {
    where.fechaHora = {
      ...(f.desde && { gte: inicioDiaBogota(f.desde) }),
      // "hasta" es inclusivo: todo el día en hora Colombia.
      ...(f.hasta && { lt: new Date(inicioDiaBogota(f.hasta).getTime() + MS_POR_DIA) }),
    };
  }
  if (f.departamento) where.departamento = f.departamento;
  if (f.fuente) where.fuente = f.fuente;
  if (f.magMin !== undefined || f.magMax !== undefined) {
    where.magnitud = { ...(f.magMin !== undefined && { gte: f.magMin }), ...(f.magMax !== undefined && { lte: f.magMax }) };
  }
  if (f.profMin !== undefined || f.profMax !== undefined) {
    where.profundidadKm = {
      ...(f.profMin !== undefined && { gte: f.profMin }),
      ...(f.profMax !== undefined && { lte: f.profMax }),
    };
  }
  return where;
}
