import { dataSource } from '../../config/db.js';
import { logger } from '../../config/logger.js';

export const JOB_MANTENCION = 'mantencion.limpiar';

// Limpieza diaria (ADR 0017): auditoría de más de 1 año y sesiones vencidas.
export async function mantencionLimpiar(jobId?: string): Promise<{ sesiones_borradas: number }> {
  const inicio = Date.now();
  logger.debug({ job: JOB_MANTENCION, job_id: jobId }, 'job iniciado');
  try {
    await dataSource.query('SELECT limpiar_auditoria()');
    const borradas: unknown[] = await dataSource.query(
      'DELETE FROM sesion WHERE expira_en < now() OR expira_max_en < now() RETURNING id',
    );
    const resultado = { sesiones_borradas: borradas.length };
    logger.info(
      {
        job: JOB_MANTENCION,
        job_id: jobId,
        duracion_ms: Date.now() - inicio,
        sesiones_borradas: resultado.sesiones_borradas,
      },
      'job terminado',
    );
    return resultado;
  } catch (err) {
    logger.error(
      { err, job: JOB_MANTENCION, job_id: jobId, duracion_ms: Date.now() - inicio },
      'job fallido',
    );
    throw err;
  }
}
