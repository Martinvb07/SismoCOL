import { crearApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const servidor = crearApp().listen(env.PORT, () => {
  logger.info(`API de SismoCol escuchando en el puerto ${env.PORT}`);
});

function apagar(senal: string) {
  logger.info(`${senal} recibido, cerrando…`);
  servidor.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
