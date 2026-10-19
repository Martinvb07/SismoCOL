import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { manejarErrores } from './lib/errores.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { rutasAdmin } from './modulos/admin/admin.rutas.js';
import { rutasAnalisis } from './modulos/analisis/analisis.rutas.js';
import { rutasAuth } from './modulos/auth/auth.rutas.js';
import { rutasCargas } from './modulos/cargas/cargas.rutas.js';
import { rutasSismos } from './modulos/sismos/sismos.rutas.js';
import { rutasUsuarios } from './modulos/usuarios/usuarios.rutas.js';

// Rutas del contrato que llegan en fases posteriores (modelo, simulación).
const RUTAS_PENDIENTES = ['/api/predicciones', '/api/modelos', '/api/simulaciones', '/api/dispositivos'];

export function crearApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // detrás de Nginx en producción
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS }));
  app.use(express.json({ limit: '100kb' }));
  app.use(pinoHttp({ logger }));

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ estado: 'ok', baseDatos: 'ok' });
    } catch (error) {
      logger.error({ err: error }, 'Health check: base de datos no disponible');
      res.status(503).json({ estado: 'degradado', baseDatos: 'error' });
    }
  });

  app.use('/api/auth', rutasAuth);
  app.use('/api', rutasCargas);
  app.use('/api', rutasSismos);
  app.use('/api', rutasUsuarios);
  app.use('/api', rutasAdmin);
  app.use('/api', rutasAnalisis);
  app.use(RUTAS_PENDIENTES, (_req, res) => {
    res.status(501).json({ error: 'Esta función todavía no está disponible en el servidor.' });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Recurso no encontrado' });
  });
  app.use(manejarErrores);

  return app;
}
