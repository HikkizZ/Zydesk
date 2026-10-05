import PgBoss from 'pg-boss';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { registrarJobArchivar } from './archivar.js';
import { registrarJobArchivos } from './archivos.js';
import { registrarJobEnviarAviso } from './enviar-aviso.js';
import { JOB_MANTENCION, mantencionLimpiar } from './mantencion.js';
import { registrarJobResumenDiario } from './resumen-diario.js';
import { registrarJobUf } from './uf.js';
import { registrarJobVencimientos } from './vencimientos.js';

export function crearBoss(): PgBoss {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (err) => logger.error({ err }, 'error de pg-boss'));
  return boss;
}

// Registra los workers y sus programaciones diarias (America/Santiago): mantención 03:00 (ADR 0017),
// archivado de tickets 03:10 y limpieza de archivos huérfanos 04:00 (spec fase-2 §5.6 y §4.6) y
// vencimientos de tickets cada 30 minutos, cola de envíos por Telegram y resumen diario 08:30 L–V
// (spec fase-6 §8) y la UF del día cada hora (spec fase-8b §7).
export async function iniciarJobs(boss: PgBoss): Promise<void> {
  await boss.createQueue(JOB_MANTENCION);
  await boss.work(JOB_MANTENCION, async ([job]) => {
    await mantencionLimpiar(job?.id, boss);
  });
  await boss.schedule(JOB_MANTENCION, '0 3 * * *', {}, { tz: 'America/Santiago' });
  await registrarJobArchivar(boss);
  await registrarJobArchivos(boss);
  await registrarJobVencimientos(boss);
  await registrarJobEnviarAviso(boss);
  await registrarJobResumenDiario(boss);
  await registrarJobUf(boss);
  logger.info('jobs iniciados');
}
