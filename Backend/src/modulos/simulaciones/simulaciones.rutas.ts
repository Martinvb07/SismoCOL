import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ErrorHttp, validarCuerpo, validarQuery } from '../../lib/errores.js';
import { enviarSimulacion } from '../../lib/mqtt.js';
import { prisma } from '../../lib/prisma.js';
import { autenticar } from '../../middleware/auth.js';

const MAX_SIMULACIONES = 50;

const esquemaSimulacion = z.object({
  magnitud: z
    .number()
    .min(2, 'Debe estar entre 2 y 8')
    .max(8, 'Debe estar entre 2 y 8')
    .refine((m) => Math.abs(m * 10 - Math.round(m * 10)) < 1e-9, 'Use pasos de 0,1'),
});

const esquemaLimite = z.object({ limite: z.coerce.number().int().min(1).max(MAX_SIMULACIONES).default(10) });

const SELECCION_SIMULACION = {
  idSimulacion: true,
  magnitudSimulada: true,
  estadoEnvio: true,
  fecha: true,
  dispositivo: { select: { idDispositivo: true, nombre: true } },
} satisfies Prisma.SimulacionSelect;

type SimulacionBd = Prisma.SimulacionGetPayload<{ select: typeof SELECCION_SIMULACION }>;

function aSimulacion(s: SimulacionBd) {
  return { ...s, magnitudSimulada: s.magnitudSimulada.toNumber(), fecha: s.fecha.toISOString() };
}

type DispositivoBd = Prisma.DispositivoEsp32GetPayload<object>;

/** Sin latido reciente, el dispositivo se considera desconectado aunque la fila diga lo contrario. */
function aDispositivo(d: DispositivoBd) {
  const vigente = d.ultimaConexion !== null && Date.now() - d.ultimaConexion.getTime() <= env.MQTT_LATIDO_TIMEOUT_MS;
  return {
    idDispositivo: d.idDispositivo,
    nombre: d.nombre,
    topicoMqtt: d.topicoMqtt,
    estado: d.estado === 'EN_LINEA' && vigente ? ('EN_LINEA' as const) : ('DESCONECTADO' as const),
    ultimaConexion: d.ultimaConexion?.toISOString() ?? null,
  };
}

export const rutasSimulaciones = Router();

rutasSimulaciones.post('/simulaciones', autenticar, validarCuerpo(esquemaSimulacion), async (req, res) => {
  const { magnitud } = req.body as z.infer<typeof esquemaSimulacion>;
  const dispositivo = await prisma.dispositivoEsp32.findFirst({ orderBy: { idDispositivo: 'asc' } });
  if (!dispositivo) throw new ErrorHttp(409, 'No hay un dispositivo ESP32 registrado. Ejecute el seed de la API.');

  const { idSimulacion } = await prisma.simulacion.create({
    data: { idUsuario: res.locals.usuario.idUsuario, idDispositivo: dispositivo.idDispositivo, magnitudSimulada: magnitud },
    select: { idSimulacion: true },
  });
  // Espera el ACK hasta MQTT_ACK_TIMEOUT_MS (5 s): ENVIADA si llega, FALLIDA si no.
  const confirmada = await enviarSimulacion(dispositivo.topicoMqtt, idSimulacion, magnitud);
  const [simulacion] = await Promise.all([
    prisma.simulacion.update({
      where: { idSimulacion },
      data: { estadoEnvio: confirmada ? 'ENVIADA' : 'FALLIDA' },
      select: SELECCION_SIMULACION,
    }),
    confirmada
      ? prisma.dispositivoEsp32.update({
          where: { idDispositivo: dispositivo.idDispositivo },
          data: { estado: 'EN_LINEA', ultimaConexion: new Date() },
        })
      : null,
  ]);
  req.log.info({ idSimulacion, magnitud, confirmada }, 'Simulación enviada');
  res.status(201).json(aSimulacion(simulacion));
});

rutasSimulaciones.get('/simulaciones', autenticar, validarQuery(esquemaLimite), async (_req, res) => {
  const { limite } = res.locals.query as z.infer<typeof esquemaLimite>;
  const simulaciones = await prisma.simulacion.findMany({
    where: { idUsuario: res.locals.usuario.idUsuario },
    select: SELECCION_SIMULACION,
    orderBy: [{ fecha: 'desc' }, { idSimulacion: 'desc' }],
    take: limite,
  });
  res.json(simulaciones.map(aSimulacion));
});

// D12: lectura abierta a USUARIO porque la pantalla de simulación muestra el estado.
rutasSimulaciones.get('/dispositivos/estado', autenticar, async (_req, res) => {
  const dispositivos = await prisma.dispositivoEsp32.findMany({ orderBy: { idDispositivo: 'asc' } });
  res.json(dispositivos.map(aDispositivo));
});
