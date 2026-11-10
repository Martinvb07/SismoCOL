import { Router } from 'express';
import { z } from 'zod';
import { llamarAnalytics } from '../../lib/analytics.js';
import { autenticar, soloAdmin } from '../../middleware/auth.js';

// El ajuste de Reasenberg-Jones y la validación corren en Analytics
// (sismocol/replicas.py); aquí se valida, se autoriza y se reenvía.

const esquemaId = z.object({ id: z.coerce.number().int().positive() });
const TIEMPO_CALCULO_MS = 120_000;

export const rutasReplicas = Router();

rutasReplicas.get('/replicas', autenticar, async (_req, res) => {
  res.json(await llamarAnalytics('/replicas'));
});

/** Pronóstico al vuelo de cualquier sismo SGC o USGS con M ≥ 4 (usa el guardado si es un principal). */
rutasReplicas.get('/replicas/sismo/:id', autenticar, async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  res.json(await llamarAnalytics(`/replicas/sismo/${id}`, { timeoutMs: TIEMPO_CALCULO_MS }));
});

rutasReplicas.get('/replicas/:id', autenticar, async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  res.json(await llamarAnalytics(`/replicas/${id}`));
});

rutasReplicas.post('/replicas/recalcular', autenticar, soloAdmin, async (req, res) => {
  const resultado = await llamarAnalytics('/replicas/recalcular', { metodo: 'POST', timeoutMs: TIEMPO_CALCULO_MS });
  req.log.info({ resultado }, 'Pronóstico de réplicas recalculado');
  res.status(201).json(resultado);
});

rutasReplicas.post('/replicas/:id/validar', autenticar, soloAdmin, async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  const resultado = await llamarAnalytics(`/replicas/${id}/validar`, { metodo: 'POST', timeoutMs: TIEMPO_CALCULO_MS });
  req.log.info({ idSismo: id }, 'Validación retrospectiva de réplicas');
  res.status(201).json(resultado);
});
