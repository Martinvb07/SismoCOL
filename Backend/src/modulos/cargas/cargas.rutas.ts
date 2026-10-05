import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { FuenteDato, type Prisma } from '../../generated/prisma/client.js';
import { llamarAnalytics } from '../../lib/analytics.js';
import { ErrorHttp, validarQuery } from '../../lib/errores.js';
import { esquemaPaginacion, paginado } from '../../lib/paginacion.js';
import { prisma } from '../../lib/prisma.js';
import { autenticar, soloAdmin } from '../../middleware/auth.js';

const BYTES_POR_MB = 1024 * 1024;
const EXTENSIONES_PERMITIDAS = new Set(['.csv', '.xlsx', '.xlsm']);

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_MB * BYTES_POR_MB, files: 1 },
  fileFilter: (_req, archivo, aceptar) => {
    const extension = path.extname(archivo.originalname).toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.has(extension)) {
      aceptar(new ErrorHttp(400, 'Formato no soportado. Use CSV o XLSX.'));
      return;
    }
    aceptar(null, true);
  },
});

const esquemaCampos = z.object({
  fuente: z.enum(FuenteDato).optional(),
  zonaHoraria: z
    .string()
    .refine((zona) => Intl.supportedValuesOf('timeZone').includes(zona) || zona === 'UTC', 'Zona horaria inválida')
    .optional(),
});

const SELECCION_CARGA = {
  idCarga: true,
  origen: true,
  fuente: true,
  nombreArchivo: true,
  registrosLeidos: true,
  registrosValidos: true,
  estado: true,
  fechaCarga: true,
  usuario: { select: { idUsuario: true, nombre: true } },
} satisfies Prisma.CargaDatosSelect;

type CargaBd = Prisma.CargaDatosGetPayload<{ select: typeof SELECCION_CARGA }>;

function aCarga(c: CargaBd) {
  return { ...c, fechaCarga: c.fechaCarga.toISOString() };
}

async function cargasPorId(ids: number[]) {
  const cargas = await prisma.cargaDatos.findMany({
    where: { idCarga: { in: ids } },
    select: SELECCION_CARGA,
    orderBy: { idCarga: 'asc' },
  });
  return cargas.map(aCarga);
}

interface RespuestaIngesta {
  idsCarga: number[];
  reporte: Record<string, unknown>;
}

// Middleware por ruta (no router.use): el router se monta en /api junto a otros.
const soloAdmins = [autenticar, soloAdmin];

export const rutasCargas = Router();

rutasCargas.post('/cargas', ...soloAdmins, subida.single('archivo'), async (req, res) => {
  if (!req.file) throw new ErrorHttp(400, 'Adjunte un archivo en el campo "archivo"');
  const campos = esquemaCampos.parse(req.body ?? {});

  const formulario = new FormData();
  formulario.append('archivo', new Blob([req.file.buffer]), req.file.originalname);
  formulario.append('id_usuario', String(res.locals.usuario.idUsuario));
  if (campos.fuente) formulario.append('fuente', campos.fuente);
  if (campos.zonaHoraria) formulario.append('zona_horaria', campos.zonaHoraria);

  const resultado = await llamarAnalytics<RespuestaIngesta>('/ingest', { metodo: 'POST', cuerpo: formulario });
  req.log.info({ idsCarga: resultado.idsCarga, archivo: req.file.originalname }, 'Carga procesada');
  res.status(201).json({ cargas: await cargasPorId(resultado.idsCarga), reporte: resultado.reporte });
});

rutasCargas.get('/cargas', ...soloAdmins, validarQuery(esquemaPaginacion), async (_req, res) => {
  const { pagina, tamano } = res.locals.query as z.infer<typeof esquemaPaginacion>;
  const [datos, total] = await prisma.$transaction([
    prisma.cargaDatos.findMany({
      select: SELECCION_CARGA,
      orderBy: { fechaCarga: 'desc' },
      skip: (pagina - 1) * tamano,
      take: tamano,
    }),
    prisma.cargaDatos.count(),
  ]);
  res.json(paginado(datos.map(aCarga), total, pagina, tamano));
});

rutasCargas.post('/sincronizaciones', ...soloAdmins, async (req, res) => {
  const resultado = await llamarAnalytics<{ idsCarga: number[]; errores: string[] }>('/sync', { metodo: 'POST' });
  if (resultado.errores.length) req.log.warn({ errores: resultado.errores }, 'Sincronización parcial');
  res.status(201).json({ cargas: await cargasPorId(resultado.idsCarga), errores: resultado.errores });
});
