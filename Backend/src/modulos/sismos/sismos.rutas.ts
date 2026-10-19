import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { validarQuery } from '../../lib/errores.js';
import { esquemaPaginacion, paginado } from '../../lib/paginacion.js';
import { prisma } from '../../lib/prisma.js';
import { autenticar } from '../../middleware/auth.js';
import { calcularEstadisticas } from './sismos.estadisticas.js';
import { construirWhere, esquemaFiltros, type FiltrosSismos } from './sismos.filtros.js';
import { aSismo, SELECCION_SISMO, type Sismo } from './sismos.serializar.js';

const MAX_FILAS_CSV = 100_000;
const LOTE_CSV = 5000;
const BOM_UTF8 = '﻿';

const ORDENES = {
  fecha_desc: [{ fechaHora: 'desc' }, { idSismo: 'desc' }],
  fecha_asc: [{ fechaHora: 'asc' }, { idSismo: 'asc' }],
  magnitud_desc: [{ magnitud: 'desc' }, { fechaHora: 'desc' }],
  magnitud_asc: [{ magnitud: 'asc' }, { fechaHora: 'desc' }],
} satisfies Record<string, Prisma.RegistroSismicoOrderByWithRelationInput[]>;

const esquemaListado = esquemaFiltros.and(esquemaPaginacion).and(
  z.object({ orden: z.enum(Object.keys(ORDENES) as [keyof typeof ORDENES]).default('fecha_desc') }),
);

const COLUMNAS_CSV = [
  'idSismo', 'fechaHora', 'latitud', 'longitud', 'precisionUbicacion', 'profundidadKm', 'magnitud',
  'departamento', 'municipio', 'zona', 'fuente', 'nivelImpacto', 'esReplica', 'esAnomalo', 'motivoAnomalia',
] as const satisfies ReadonlyArray<keyof Sismo>;

function csvEscapar(valor: string | number | boolean | null): string {
  if (valor === null) return '';
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export const rutasSismos = Router();

rutasSismos.get('/sismos', autenticar, validarQuery(esquemaListado), async (_req, res) => {
  const { pagina, tamano, orden, ...filtros } = res.locals.query as z.infer<typeof esquemaListado>;
  const where = construirWhere(filtros);
  const [datos, total] = await prisma.$transaction([
    prisma.registroSismico.findMany({
      where,
      select: SELECCION_SISMO,
      orderBy: ORDENES[orden],
      skip: (pagina - 1) * tamano,
      take: tamano,
    }),
    prisma.registroSismico.count({ where }),
  ]);
  res.json(paginado(datos.map(aSismo), total, pagina, tamano));
});

rutasSismos.get('/sismos/exportar', autenticar, validarQuery(esquemaFiltros), async (_req, res) => {
  const where = construirWhere(res.locals.query as FiltrosSismos);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sismos.csv"');
  res.write(`${BOM_UTF8}${COLUMNAS_CSV.join(',')}\n`);

  // Por lotes, para no tener 100 000 filas en memoria a la vez.
  let ultimoId = 0;
  let escritas = 0;
  while (escritas < MAX_FILAS_CSV) {
    const lote = await prisma.registroSismico.findMany({
      where: { AND: [where, { idSismo: { gt: ultimoId } }] },
      select: SELECCION_SISMO,
      orderBy: { idSismo: 'asc' },
      take: Math.min(LOTE_CSV, MAX_FILAS_CSV - escritas),
    });
    if (lote.length === 0) break;
    const filas = lote.map((s) => {
      const sismo = aSismo(s);
      return COLUMNAS_CSV.map((c) => csvEscapar(sismo[c])).join(',');
    });
    res.write(`${filas.join('\n')}\n`);
    escritas += lote.length;
    ultimoId = lote[lote.length - 1]!.idSismo;
  }
  res.end();
});

rutasSismos.get('/departamentos', autenticar, async (_req, res) => {
  const filas = await prisma.registroSismico.findMany({
    where: { departamento: { not: null } },
    distinct: ['departamento'],
    select: { departamento: true },
  });
  res.json(
    filas
      .map((f) => f.departamento as string)
      .sort((a, b) => a.localeCompare(b, 'es')),
  );
});

rutasSismos.get('/estadisticas', autenticar, validarQuery(esquemaFiltros), async (_req, res) => {
  res.json(await calcularEstadisticas(construirWhere(res.locals.query as FiltrosSismos)));
});
