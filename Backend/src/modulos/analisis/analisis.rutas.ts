import { Router } from 'express';
import { z } from 'zod';
import { NivelAdvertencia, type Prisma } from '../../generated/prisma/client.js';
import { llamarAnalytics } from '../../lib/analytics.js';
import { validarCuerpo, validarQuery } from '../../lib/errores.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { autenticar, soloAdmin } from '../../middleware/auth.js';

// Los cálculos los hace el servicio analítico (Analytics/sismocol/analisis.py);
// aquí se valida, se autoriza y se reenvía.

const esquemaZona = z.object({ zona: z.string().trim().min(1, 'Indique la zona').max(60) });
const esquemaAdvertencias = z.object({
  zona: z.string().trim().min(1).max(60).optional(),
  nivel: z.enum(NivelAdvertencia).optional(),
});

const esquemaConfiguracion = z
  .object({
    ventanaDias: z.number().int().min(1).max(90),
    periodoBaseMeses: z.number().int().min(1).max(120),
    umbralElevada: z.number().min(0).max(1),
    umbralAlta: z.number().min(0).max(1),
    minEventosZona: z.number().int().min(10).max(1000),
  })
  .refine((c) => c.umbralAlta < c.umbralElevada, {
    message: 'Debe ser menor que el umbral de actividad elevada',
    path: ['umbralAlta'],
  });

const MENSAJE_RECALCULO = 'El recálculo se inició. Los resultados se actualizarán en unos minutos.';

function conQuery(ruta: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams(Object.entries(query).filter((par): par is [string, string] => par[1] !== undefined));
  const texto = params.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}

type ConfiguracionBd = Prisma.ConfiguracionAnalisisGetPayload<object>;

function aConfiguracion(c: ConfiguracionBd) {
  return {
    idConfig: c.idConfig,
    ventanaDias: c.ventanaDias,
    periodoBaseMeses: c.periodoBaseMeses,
    umbralElevada: c.umbralElevada.toNumber(),
    umbralAlta: c.umbralAlta.toNumber(),
    minEventosZona: c.minEventosZona,
    fechaActualizacion: c.fechaActualizacion.toISOString(),
  };
}

/** La configuración vigente es la de fecha_actualizacion más reciente. */
function configuracionVigente() {
  return prisma.configuracionAnalisis.findFirstOrThrow({
    orderBy: [{ fechaActualizacion: 'desc' }, { idConfig: 'desc' }],
  });
}

/** El recálculo corre en segundo plano en Analytics; si no responde, se registra y se sigue. */
async function iniciarRecalculo(): Promise<void> {
  try {
    await llamarAnalytics('/analisis/recalcular', { metodo: 'POST', timeoutMs: 15_000 });
  } catch (error) {
    logger.warn({ err: error }, 'No se pudo iniciar el recálculo del análisis');
    throw error;
  }
}

export const rutasAnalisis = Router();

rutasAnalisis.get('/analisis/zonas', autenticar, async (_req, res) => {
  res.json(await llamarAnalytics('/analisis/zonas'));
});

rutasAnalisis.get('/analisis/frecuencia', autenticar, validarQuery(esquemaZona), async (_req, res) => {
  const { zona } = res.locals.query as z.infer<typeof esquemaZona>;
  res.json(await llamarAnalytics(conQuery('/analisis/frecuencia', { zona })));
});

rutasAnalisis.get('/analisis/gutenberg-richter', autenticar, validarQuery(esquemaZona), async (_req, res) => {
  const { zona } = res.locals.query as z.infer<typeof esquemaZona>;
  res.json(await llamarAnalytics(conQuery('/analisis/gutenberg-richter', { zona })));
});

rutasAnalisis.get('/analisis/probabilidades', autenticar, async (_req, res) => {
  res.json(await llamarAnalytics('/analisis/probabilidades'));
});

rutasAnalisis.get('/advertencias', autenticar, validarQuery(esquemaAdvertencias), async (_req, res) => {
  const filtros = res.locals.query as z.infer<typeof esquemaAdvertencias>;
  res.json(await llamarAnalytics(conQuery('/analisis/advertencias', filtros)));
});

rutasAnalisis.get('/analisis/configuracion', autenticar, soloAdmin, async (_req, res) => {
  res.json(aConfiguracion(await configuracionVigente()));
});

rutasAnalisis.put('/analisis/configuracion', autenticar, soloAdmin, validarCuerpo(esquemaConfiguracion), async (req, res) => {
  const datos = req.body as z.infer<typeof esquemaConfiguracion>;
  // Se guarda una fila nueva: así cada análisis queda ligado a la configuración con que se calculó.
  const nueva = await prisma.configuracionAnalisis.create({
    data: { ...datos, idUsuario: res.locals.usuario.idUsuario },
  });
  req.log.info({ idConfig: nueva.idConfig }, 'Configuración del análisis actualizada');
  iniciarRecalculo().catch(() => undefined);
  res.json(aConfiguracion(nueva));
});

rutasAnalisis.post('/analisis/recalcular', autenticar, soloAdmin, async (_req, res) => {
  await iniciarRecalculo();
  res.status(202).json({ mensaje: MENSAJE_RECALCULO });
});
