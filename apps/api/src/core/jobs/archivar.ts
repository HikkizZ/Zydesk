import type PgBoss from 'pg-boss';
import { logger } from '../../config/logger.js';
import { registrarEvento } from '../historial/evento.js';
import { enTransaccion } from '../historial/transaccion.js';

export const JOB_ARCHIVAR = 'tickets.archivar';

// Archiva los tickets cerrados hace más de 7 días y deja un evento `archivado` por ticket (spec fase-2 §5.6).
export async function archivarCerrados(jobId?: string): Promise<{ archivados: number }> {
  const inicio = Date.now();
  logger.debug({ job: JOB_ARCHIVAR, job_id: jobId }, 'job iniciado');
  try {
    const archivados = await enTransaccion(async (tx) => {
      // UPDATE … RETURNING devuelve [filas, cantidad]
      const [filas] = (await tx.query(
        `UPDATE ticket SET archivado_en = now()
          WHERE cerrado_en < now() - interval '7 days' AND archivado_en IS NULL
          RETURNING id`,
      )) as [{ id: number }[], number];
      for (const { id } of filas) {
        await registrarEvento(tx, {
          entidad: 'ticket',
          entidad_id: id,
          actor: { id: null },
          accion: 'archivado',
        });
      }
      return filas.length;
    });
    logger.info(
      { job: JOB_ARCHIVAR, job_id: jobId, duracion_ms: Date.now() - inicio, archivados },
      'job terminado',
    );
    return { archivados };
  } catch (err) {
    logger.error(
      { err, job: JOB_ARCHIVAR, job_id: jobId, duracion_ms: Date.now() - inicio },
      'job fallido',
    );
    throw err;
  }
}

// Cola, worker y programación diaria 03:10 America/Santiago (10 min después de `mantencion.limpiar`).
export async function registrarJobArchivar(boss: PgBoss): Promise<void> {
  await boss.createQueue(JOB_ARCHIVAR);
  await boss.work(JOB_ARCHIVAR, async ([job]) => {
    await archivarCerrados(job?.id);
  });
  await boss.schedule(JOB_ARCHIVAR, '10 3 * * *', {}, { tz: 'America/Santiago' });
}
