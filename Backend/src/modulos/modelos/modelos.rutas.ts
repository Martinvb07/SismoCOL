import { Router } from 'express';
import { z } from 'zod';
import type { NivelImpacto, Prisma } from '../../generated/prisma/client.js';
import { llamarAnalytics } from '../../lib/analytics.js';
import { ErrorHttp, validarCuerpo } from '../../lib/errores.js';
import { prisma } from '../../lib/prisma.js';
import { autenticar, soloAdmin } from '../../middleware/auth.js';

// El entrenamiento y la inferencia corren en Analytics (sismocol/modelo.py).

const SELECCION_MODELO = {
  idModelo: true,
  version: true,
  algoritmo: true,
  exactitud: true,
  f1Macro: true,
  activo: true,
  fechaEntrenamiento: true,
} satisfies Prisma.ModeloPredictivoSelect;

type ModeloBd = Prisma.ModeloPredictivoGetPayload<{ select: typeof SELECCION_MODELO }>;

function aModelo(m: ModeloBd) {
  return {
    ...m,
    exactitud: m.exactitud.toNumber(),
    f1Macro: m.f1Macro.toNumber(),
    fechaEntrenamiento: m.fechaEntrenamiento.toISOString(),
  };
}

const esquemaPrediccion = z.object({
  magnitud: z.number().min(2, 'Debe estar entre 2 y 9').max(9, 'Debe estar entre 2 y 9'),
  profundidadKm: z.number().min(0, 'Debe estar entre 0 y 700 km').max(700, 'Debe estar entre 0 y 700 km'),
  latitud: z.number().min(-4.3, 'Debe estar entre −4,3 y 13,5').max(13.5, 'Debe estar entre −4,3 y 13,5'),
  longitud: z.number().min(-82, 'Debe estar entre −82 y −66,8').max(-66.8, 'Debe estar entre −82 y −66,8'),
});

const esquemaId = z.object({ id: z.coerce.number().int().positive() });

interface RespuestaInferencia {
  nivelImpacto: NivelImpacto;
  probabilidad: number;
  probabilidades: Record<NivelImpacto, number>;
  modelo: { idModelo: number; version: string; algoritmo: string };
  /** Modelos con variables nuevas (D18): municipio evaluado, intensidad y explicación SHAP. */
  municipio?: { codigo: string; nombre: string; departamento: string; distanciaKm: number };
  intensidadMmi?: number;
  distanciaHipocentralKm?: number;
  explicacion?: Array<{ variable: string; etiqueta: string; valor: number; contribucion: number }> | null;
}

function cuerpoAnalytics(entrada: z.infer<typeof esquemaPrediccion>) {
  return {
    magnitud: entrada.magnitud,
    profundidad_km: entrada.profundidadKm,
    latitud: entrada.latitud,
    longitud: entrada.longitud,
  };
}

const soloAdmins = [autenticar, soloAdmin];

export const rutasModelos = Router();

rutasModelos.get('/modelos', ...soloAdmins, async (_req, res) => {
  const modelos = await prisma.modeloPredictivo.findMany({ select: SELECCION_MODELO, orderBy: { idModelo: 'desc' } });
  res.json(modelos.map(aModelo));
});

rutasModelos.post('/modelos/entrenar', ...soloAdmins, async (req, res) => {
  const resultado = await llamarAnalytics<{ modelo: { idModelo: number; version: string } }>('/modelos/entrenar', {
    metodo: 'POST',
  });
  req.log.info({ idModelo: resultado.modelo.idModelo, version: resultado.modelo.version }, 'Modelo entrenado');
  res.status(201).json(resultado);
});

rutasModelos.patch('/modelos/:id/activar', ...soloAdmins, async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  const modelo = await prisma.$transaction(async (tx) => {
    const existe = await tx.modeloPredictivo.findUnique({ where: { idModelo: id }, select: { idModelo: true } });
    if (!existe) throw new ErrorHttp(404, 'El modelo no existe');
    await tx.modeloPredictivo.updateMany({ where: { activo: true, idModelo: { not: id } }, data: { activo: false } });
    return tx.modeloPredictivo.update({ where: { idModelo: id }, data: { activo: true }, select: SELECCION_MODELO });
  });
  req.log.info({ idModelo: id }, 'Modelo activado');
  res.json(aModelo(modelo));
});

rutasModelos.post('/predicciones', autenticar, validarCuerpo(esquemaPrediccion), async (req, res) => {
  const entrada = req.body as z.infer<typeof esquemaPrediccion>;
  const inferencia = await llamarAnalytics<RespuestaInferencia>('/modelos/predecir', {
    metodo: 'POST',
    cuerpo: cuerpoAnalytics(entrada),
    timeoutMs: 60_000,
  });
  const [prediccion, modelo] = await Promise.all([
    prisma.prediccion.create({
      data: {
        idUsuario: res.locals.usuario.idUsuario,
        idModelo: inferencia.modelo.idModelo,
        magnitud: entrada.magnitud,
        profundidadKm: entrada.profundidadKm,
        latitud: entrada.latitud,
        longitud: entrada.longitud,
        nivelImpacto: inferencia.nivelImpacto,
        probabilidad: inferencia.probabilidad,
      },
      select: { idPrediccion: true },
    }),
    prisma.modeloPredictivo.findUniqueOrThrow({
      where: { idModelo: inferencia.modelo.idModelo },
      select: { fechaEntrenamiento: true },
    }),
  ]);
  res.json({
    idPrediccion: prediccion.idPrediccion,
    nivelImpacto: inferencia.nivelImpacto,
    probabilidad: inferencia.probabilidad,
    probabilidades: inferencia.probabilidades,
    modelo: { ...inferencia.modelo, fechaEntrenamiento: modelo.fechaEntrenamiento.toISOString() },
    municipio: inferencia.municipio ?? null,
    intensidadMmi: inferencia.intensidadMmi ?? null,
    distanciaHipocentralKm: inferencia.distanciaHipocentralKm ?? null,
    explicacion: inferencia.explicacion ?? null,
  });
});

/** Simulador de escenarios: intensidad y nivel de impacto en todos los municipios cercanos (D18). No se guarda. */
rutasModelos.post('/escenarios', autenticar, validarCuerpo(esquemaPrediccion), async (req, res) => {
  const entrada = req.body as z.infer<typeof esquemaPrediccion>;
  res.json(await llamarAnalytics('/modelos/escenario', { metodo: 'POST', cuerpo: cuerpoAnalytics(entrada), timeoutMs: 60_000 }));
});

/** Reporte completo de un entrenamiento: comparación, calibración, confiabilidad, SHAP y activación. */
rutasModelos.get('/modelos/:id/reporte', ...soloAdmins, async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  res.json(await llamarAnalytics(`/modelos/${id}/reporte`));
});
