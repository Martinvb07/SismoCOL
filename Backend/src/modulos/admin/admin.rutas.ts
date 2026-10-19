import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { autenticar, soloAdmin } from '../../middleware/auth.js';
import { aCarga, SELECCION_CARGA } from '../cargas/cargas.rutas.js';

const ACTIVIDAD_RECIENTE = 10;

const decimal1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const entero = new Intl.NumberFormat('es-CO');

type TipoActividad = 'CARGA' | 'PREDICCION' | 'SIMULACION' | 'ENTRENAMIENTO';

interface Actividad {
  tipo: TipoActividad;
  descripcion: string;
  fecha: Date;
  usuario: string | null;
}

const DESCRIPCION_SIMULACION = { PENDIENTE: 'pendiente', ENVIADA: 'enviada al ESP32', FALLIDA: 'sin confirmación del ESP32' } as const;

/** Lo más reciente de cada tabla, mezclado y ordenado por fecha. */
async function actividadReciente(): Promise<Actividad[]> {
  const n = ACTIVIDAD_RECIENTE;
  const [cargas, predicciones, simulaciones, modelos] = await Promise.all([
    prisma.cargaDatos.findMany({ select: SELECCION_CARGA, orderBy: { fechaCarga: 'desc' }, take: n }),
    prisma.prediccion.findMany({
      select: { magnitud: true, profundidadKm: true, nivelImpacto: true, fecha: true, usuario: { select: { nombre: true } } },
      orderBy: { fecha: 'desc' },
      take: n,
    }),
    prisma.simulacion.findMany({
      select: { magnitudSimulada: true, estadoEnvio: true, fecha: true, usuario: { select: { nombre: true } } },
      orderBy: { fecha: 'desc' },
      take: n,
    }),
    prisma.modeloPredictivo.findMany({
      select: { version: true, algoritmo: true, fechaEntrenamiento: true },
      orderBy: { fechaEntrenamiento: 'desc' },
      take: n,
    }),
  ]);

  const actividad: Actividad[] = [
    ...cargas.map((c) => ({
      tipo: 'CARGA' as const,
      descripcion:
        c.origen === 'API'
          ? `Sincronización ${c.fuente} (${entero.format(c.registrosValidos)} registros)`
          : `Carga de ${c.nombreArchivo}: ${c.fuente}, ${entero.format(c.registrosValidos)} registros válidos`,
      fecha: c.fechaCarga,
      usuario: c.usuario?.nombre ?? null,
    })),
    ...predicciones.map((p) => ({
      tipo: 'PREDICCION' as const,
      descripcion: `Predicción M ${decimal1.format(p.magnitud.toNumber())} a ${entero.format(p.profundidadKm.toNumber())} km: ${p.nivelImpacto}`,
      fecha: p.fecha,
      usuario: p.usuario.nombre,
    })),
    ...simulaciones.map((s) => ({
      tipo: 'SIMULACION' as const,
      descripcion: `Simulación M ${decimal1.format(s.magnitudSimulada.toNumber())} ${DESCRIPCION_SIMULACION[s.estadoEnvio]}`,
      fecha: s.fecha,
      usuario: s.usuario.nombre,
    })),
    ...modelos.map((m) => ({
      tipo: 'ENTRENAMIENTO' as const,
      descripcion: `Modelo ${m.version} (${m.algoritmo}) entrenado`,
      fecha: m.fechaEntrenamiento,
      usuario: null,
    })),
  ];
  return actividad.sort((a, b) => b.fecha.getTime() - a.fecha.getTime()).slice(0, n);
}

export const rutasAdmin = Router();

rutasAdmin.get('/admin/resumen', autenticar, soloAdmin, async (_req, res) => {
  const [registros, registrosValidos, usuarios, usuariosActivos, modeloActivo, dispositivo, ultimaCarga, actividad] =
    await Promise.all([
      prisma.registroSismico.count(),
      prisma.registroSismico.count({ where: { esAnomalo: false } }),
      prisma.usuario.count(),
      prisma.usuario.count({ where: { activo: true } }),
      prisma.modeloPredictivo.findFirst({
        where: { activo: true },
        select: { idModelo: true, version: true, algoritmo: true, f1Macro: true },
      }),
      prisma.dispositivoEsp32.findFirst({ select: { estado: true, ultimaConexion: true }, orderBy: { idDispositivo: 'asc' } }),
      prisma.cargaDatos.findFirst({ select: SELECCION_CARGA, orderBy: { fechaCarga: 'desc' } }),
      actividadReciente(),
    ]);

  res.json({
    registros,
    registrosValidos,
    usuarios,
    usuariosActivos,
    modeloActivo: modeloActivo && { ...modeloActivo, f1Macro: modeloActivo.f1Macro.toNumber() },
    dispositivo: dispositivo && { estado: dispositivo.estado, ultimaConexion: dispositivo.ultimaConexion?.toISOString() ?? null },
    ultimaCarga: ultimaCarga && aCarga(ultimaCarga),
    actividadReciente: actividad.map((a) => ({ ...a, fecha: a.fecha.toISOString() })),
  });
});
