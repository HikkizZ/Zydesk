import 'reflect-metadata';
import { crearApp } from './app.js';
import { comprobarBd, dataSource } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'promesa rechazada sin manejar');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'excepción sin capturar');
  process.exit(1);
});

try {
  await dataSource.initialize();
} catch (err) {
  logger.error({ err }, 'no se pudo conectar a la base de datos');
  process.exit(1);
}

const app = crearApp({ comprobarBd });
const server = app.listen(env.API_PUERTO);
logger.info({ puerto: env.API_PUERTO }, 'api iniciada');

async function apagar(): Promise<void> {
  logger.info('apagando api');
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close();
  await dataSource.destroy();
  logger.info('api detenida');
  process.exit(0);
}

process.on('SIGTERM', () => void apagar());
process.on('SIGINT', () => void apagar());
