import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

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

  app.use((_req, res) => {
    res.status(404).json({ error: 'Recurso no encontrado' });
  });

  const manejarError: ErrorRequestHandler = (error, req, res, _next) => {
    req.log.error({ err: error }, 'Error no controlado');
    res.status(500).json({ error: 'Error interno del servidor' });
  };
  app.use(manejarError);

  return app;
}
