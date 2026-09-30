import type PgBoss from 'pg-boss';
import { dataSource } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { storage } from '../../integraciones/storage/storage.js';
import { enTransaccion } from '../historial/transaccion.js';

export const JOB_ARCHIVOS_HUERFANOS = 'archivos.limpiar_huerfanos';

// Borra los pendientes (entidad NULL) de más de 24 h: fila y archivo en disco (ADR 0009).
export async function limpiarHuerfanos(jobId?: string): Promise<{ borrados: number }> {
  const inicio = Date.now();
  logger.debug({ job: JOB_ARCHIVOS_HUERFANOS, job_id: jobId }, 'job iniciado');
  try {
    const filas = (await dataSource.query(
      `SELECT id, clave FROM archivo WHERE entidad IS NULL AND subido_en < now() - interval '24 hours'`,
    )) as Array<{ id: number; clave: string }>;
    let borrados = 0;
    for (const f of filas) {
      await storage.eliminar(f.clave);
      // si el archivo se asoció entre el SELECT y el DELETE, `entidad IS NULL` evita borrarlo
      const [, n] = (await enTransaccion((tx) =>
        tx.query(`DELETE FROM archivo WHERE id = $1 AND entidad IS NULL`, [f.id]),
      )) as [unknown, number];
      borrados += n;
    }
    logger.info(
      { job: JOB_ARCHIVOS_HUERFANOS, job_id: jobId, duracion_ms: Date.now() - inicio, borrados },
      'job terminado',
    );
    return { borrados };
  } catch (err) {
    logger.error(
      { err, job: JOB_ARCHIVOS_HUERFANOS, job_id: jobId, duracion_ms: Date.now() - inicio },
      'job fallido',
    );
    throw err;
  }
}

// Lo llama `iniciarJobs` (boss.ts, F2-T10): cola, worker y programación diaria 04:00 Santiago.
export async function registrarJobArchivos(boss: PgBoss): Promise<void> {
  await boss.createQueue(JOB_ARCHIVOS_HUERFANOS);
  await boss.work(JOB_ARCHIVOS_HUERFANOS, async ([job]) => {
    await limpiarHuerfanos(job?.id);
  });
  await boss.schedule(JOB_ARCHIVOS_HUERFANOS, '0 4 * * *', {}, { tz: 'America/Santiago' });
}
