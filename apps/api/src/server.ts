import 'reflect-metadata';
import type PgBoss from 'pg-boss';
import { crearApp } from './app.js';
import { comprobarBd, dataSource } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { crearBoss, iniciarJobs } from './core/jobs/boss.js';
import { sembrarBase } from './database/semillas/base.js';
import { cargarLegal } from './modulos/legal/legal.service.js';

process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'promesa rechazada sin manejar');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'excepción sin capturar');
  process.exit(1);
});

// Términos y privacidad: se leen una vez al arrancar; sin ellos la API no inicia (spec §5.8).
try {
  cargarLegal();
} catch (err) {
  logger.error({ err }, 'no se pudieron leer los documentos legales (docs/legal)');
  process.exit(1);
}

try {
  await dataSource.initialize();
} catch (err) {
  logger.error({ err }, 'no se pudo conectar a la base de datos');
  process.exit(1);
}

await sembrarBase(dataSource.manager);

let boss: PgBoss | null = null;
if (env.EJECUTAR_JOBS) {
  boss = crearBoss();
  await boss.start();
  await iniciarJobs(boss);
}

const app = crearApp({ comprobarBd });
const server = app.listen(env.API_PUERTO);
logger.info({ puerto: env.API_PUERTO }, 'api iniciada');

async function apagar(): Promise<void> {
  logger.info('apagando api');
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close();
  if (boss) await boss.stop({ graceful: true });
  await dataSource.destroy();
  logger.info('api detenida');
  process.exit(0);
}

process.on('SIGTERM', () => void apagar());
process.on('SIGINT', () => void apagar());
