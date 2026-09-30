import PgBoss from 'pg-boss';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { JOB_MANTENCION, mantencionLimpiar } from './mantencion.js';

export function crearBoss(): PgBoss {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (err) => logger.error({ err }, 'error de pg-boss'));
  return boss;
}

// Registra el worker y la programación diaria a las 03:00 America/Santiago (ADR 0017).
export async function iniciarJobs(boss: PgBoss): Promise<void> {
  await boss.createQueue(JOB_MANTENCION);
  await boss.work(JOB_MANTENCION, async ([job]) => {
    await mantencionLimpiar(job?.id);
  });
  await boss.schedule(JOB_MANTENCION, '0 3 * * *', {}, { tz: 'America/Santiago' });
  logger.info('jobs iniciados');
}
