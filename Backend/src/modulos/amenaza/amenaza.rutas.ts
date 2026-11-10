import { Router } from 'express';
import { llamarAnalytics } from '../../lib/analytics.js';
import { autenticar, soloAdmin } from '../../middleware/auth.js';

// Periodos de retorno y mapa de amenaza con el catálogo histórico USGS_HIST
// (Analytics/sismocol/amenaza.py, decisión D17).

export const rutasAmenaza = Router();

rutasAmenaza.get('/amenaza/periodos-retorno', autenticar, async (_req, res) => {
  res.json(await llamarAnalytics('/amenaza/periodos-retorno'));
});

rutasAmenaza.get('/amenaza/mapa', autenticar, async (_req, res) => {
  res.json(await llamarAnalytics('/amenaza/mapa'));
});

rutasAmenaza.post('/amenaza/recalcular', autenticar, soloAdmin, async (req, res) => {
  const resultado = await llamarAnalytics('/amenaza/recalcular', { metodo: 'POST', timeoutMs: 120_000 });
  req.log.info({ resultado }, 'Amenaza recalculada');
  res.status(201).json(resultado);
});
