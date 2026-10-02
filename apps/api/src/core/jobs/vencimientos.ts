import type PgBoss from 'pg-boss';
import { logger } from '../../config/logger.js';
import { dataSource } from '../../config/db.js';
import { publicar } from '../eventos/dominio.js';

export const JOB_VENCIMIENTOS = 'tickets.vencimientos';

interface FilaVencimiento {
  id: number;
  fecha_limite: Date;
}

// Publica `ticket.vence_pronto` (límite dentro de las próximas 24 h de reloj, B2) y `ticket.vencio` (límite
// pasado hace menos de 7 días) de los tickets abiertos (spec fase 6 §8). No escribe en `ticket` ni deja
// `evento`: la `clave` del aviso evita repetirlos entre ejecuciones (§4.2).
export async function ejecutarVencimientos(
  jobId?: string,
): Promise<{ vence_pronto: number; vencio: number }> {
  const inicio = Date.now();
  logger.debug({ job: JOB_VENCIMIENTOS, job_id: jobId }, 'job iniciado');
  try {
    const porVencer: FilaVencimiento[] = await dataSource.query(
      `SELECT id, fecha_limite FROM ticket
        WHERE cerrado_en IS NULL AND fecha_limite BETWEEN now() AND now() + interval '24 hours'
        ORDER BY id`,
    );
    const vencidos: FilaVencimiento[] = await dataSource.query(
      `SELECT id, fecha_limite FROM ticket
        WHERE cerrado_en IS NULL AND fecha_limite < now() AND fecha_limite > now() - interval '7 days'
        ORDER BY id`,
    );
    for (const t of porVencer) {
      publicar('ticket.vence_pronto', {
        ticket_id: t.id,
        fecha_limite: t.fecha_limite.toISOString(),
      });
    }
    for (const t of vencidos) {
      publicar('ticket.vencio', { ticket_id: t.id, fecha_limite: t.fecha_limite.toISOString() });
    }
    const resultado = { vence_pronto: porVencer.length, vencio: vencidos.length };
    logger.info(
      { job: JOB_VENCIMIENTOS, job_id: jobId, duracion_ms: Date.now() - inicio, ...resultado },
      'job terminado',
    );
    return resultado;
  } catch (err) {
    logger.error(
      { err, job: JOB_VENCIMIENTOS, job_id: jobId, duracion_ms: Date.now() - inicio },
      'job fallido',
    );
    throw err;
  }
}

// Cola, worker y programación cada 30 minutos (America/Santiago).
export async function registrarJobVencimientos(boss: PgBoss): Promise<void> {
  await boss.createQueue(JOB_VENCIMIENTOS);
  await boss.work(JOB_VENCIMIENTOS, async ([job]) => {
    await ejecutarVencimientos(job?.id);
  });
  await boss.schedule(JOB_VENCIMIENTOS, '*/30 * * * *', {}, { tz: 'America/Santiago' });
}
