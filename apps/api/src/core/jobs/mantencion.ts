import type PgBoss from 'pg-boss';
import { dataSource } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { encolarEnvio } from './enviar-aviso.js';

export const JOB_MANTENCION = 'mantencion.limpiar';

export interface ResultadoMantencion {
  sesiones_borradas: number;
  codigos_borrados: number;
  avisos_borrados: number;
  reencolados: number;
}

// `DELETE … RETURNING` devuelve [filas, cantidad], no un arreglo de filas
const contar = (r: unknown): number => (r as [unknown[], number])[0].length;

// Limpieza diaria (ADR 0017): auditoría de más de 1 año, sesiones vencidas, códigos de vinculación vencidos
// hace más de un día y avisos leídos de más de 90 días (spec fase 6 §8). Con `boss`, reencola los envíos de
// Telegram pendientes hace más de 1 hora (cubre `boss = null` y caídas entre el commit y el `send`).
export async function mantencionLimpiar(
  jobId?: string,
  boss?: PgBoss | null,
): Promise<ResultadoMantencion> {
  const inicio = Date.now();
  logger.debug({ job: JOB_MANTENCION, job_id: jobId }, 'job iniciado');
  try {
    await dataSource.query('SELECT limpiar_auditoria()');
    const sesiones = await dataSource.query(
      'DELETE FROM sesion WHERE expira_en < now() OR expira_max_en < now() RETURNING id',
    );
    const codigos = await dataSource.query(
      `DELETE FROM codigo_vinculo WHERE expira_en < now() - interval '1 day' RETURNING id`,
    );
    const avisos = await dataSource.query(
      `DELETE FROM aviso WHERE leido_en < now() - interval '90 days' RETURNING id`,
    );
    const resultado: ResultadoMantencion = {
      sesiones_borradas: contar(sesiones),
      codigos_borrados: contar(codigos),
      avisos_borrados: contar(avisos),
      reencolados: boss ? await reencolarPendientes(boss) : 0,
    };
    logger.info(
      { job: JOB_MANTENCION, job_id: jobId, duracion_ms: Date.now() - inicio, ...resultado },
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

// `actualizado_en` se renueva al reencolar para no volver a encolar el mismo envío cada día.
async function reencolarPendientes(boss: PgBoss): Promise<number> {
  const [filas] = (await dataSource.query(
    `UPDATE aviso_envio SET actualizado_en = now()
      WHERE canal = 'telegram' AND estado = 'pendiente' AND actualizado_en < now() - interval '1 hour'
      RETURNING aviso_id`,
  )) as [{ aviso_id: string }[], number];
  for (const f of filas) await encolarEnvio(boss, f.aviso_id, 'telegram');
  return filas.length;
}
