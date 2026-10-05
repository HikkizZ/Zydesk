import type PgBoss from 'pg-boss';
import { dataSource } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  obtenerUfDelDia,
  type Fetch,
  type FuenteExterna,
  type MotivoFallo,
} from '../../integraciones/uf/cliente.js';
import { registrarUf } from '../../modulos/indicadores/indicadores.service.js';
import { hoyEnSantiago } from '../fechas.js';

export const JOB_UF = 'indicadores.uf';

export type ResultadoUf =
  | { estado: 'al_dia' }
  | { estado: 'actualizada' | 'ya_existia'; fuente: FuenteExterna; fecha: string }
  | { estado: 'sin_fuente'; fallos: Record<FuenteExterna, MotivoFallo> };

// Trae la UF del día si aún no hay fila de hoy (spec fase-8b §7). Idempotente: con la fila de hoy no sale a
// internet. No deja `evento` ni `auditoria` (`indicador_uf` es el registro). Nunca registra el valor ni el cuerpo.
export async function ejecutarActualizacionUf(
  jobId?: string,
  deps: { fetch: Fetch } = { fetch: globalThis.fetch },
): Promise<ResultadoUf> {
  const inicio = Date.now();
  logger.debug({ job: JOB_UF, job_id: jobId }, 'job iniciado');
  try {
    const hoy = hoyEnSantiago();
    const existe: unknown[] = await dataSource.query(
      `SELECT 1 FROM indicador_uf WHERE fecha = $1`,
      [hoy],
    );
    let resultado: ResultadoUf;
    if (existe.length > 0) {
      resultado = { estado: 'al_dia' };
    } else {
      const r = await obtenerUfDelDia(hoy, deps.fetch);
      for (const [fuente, motivo] of Object.entries(r.fallos)) {
        logger.warn({ job: JOB_UF, job_id: jobId, fuente, motivo }, 'fuente de uf falló');
      }
      if (r.ok) {
        const insertada = await registrarUf(dataSource.manager, r.uf);
        resultado = {
          estado: insertada ? 'actualizada' : 'ya_existia',
          fuente: r.uf.fuente,
          fecha: r.uf.fecha,
        };
      } else {
        resultado = { estado: 'sin_fuente', fallos: r.fallos };
      }
    }
    const duracion_ms = Date.now() - inicio;
    if (resultado.estado === 'sin_fuente') {
      logger.error(
        { job: JOB_UF, job_id: jobId, duracion_ms, fallos: resultado.fallos },
        'uf no actualizada',
      );
    } else {
      logger.info(
        {
          job: JOB_UF,
          job_id: jobId,
          duracion_ms,
          estado: resultado.estado,
          ...('fuente' in resultado ? { fuente: resultado.fuente, fecha: resultado.fecha } : {}),
        },
        'job terminado',
      );
    }
    return resultado;
  } catch (err) {
    logger.error(
      { err, job: JOB_UF, job_id: jobId, duracion_ms: Date.now() - inicio },
      'job fallido',
    );
    throw err;
  }
}

// Cola y worker siempre; programación (cada hora, minuto 7, America/Santiago) y envío de arranque solo con
// `UF_ACTUALIZAR`.
export async function registrarJobUf(boss: PgBoss): Promise<void> {
  await boss.createQueue(JOB_UF);
  await boss.work(JOB_UF, async ([job]) => {
    await ejecutarActualizacionUf(job?.id);
  });
  if (!env.UF_ACTUALIZAR) {
    logger.info('actualización de la UF desactivada');
    return;
  }
  await boss.schedule(JOB_UF, '7 * * * *', {}, { tz: 'America/Santiago' });
  await boss.send(JOB_UF, {}, { singletonKey: 'arranque', singletonSeconds: 600 });
}
