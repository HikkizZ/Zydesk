import {
  formatearMiDia,
  PERMISOS_POR_ROL,
  PREFERENCIAS_POR_DEFECTO,
  ZONA,
  type Rol,
} from '@zydesk/shared';
import type PgBoss from 'pg-boss';
import { dataSource } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { enviarMensaje, ErrorTelegram } from '../../integraciones/telegram/cliente.js';
import { hoyEnSantiago } from '../../modulos/horas/horas.tipos.js';
import { cargarMiDia } from '../../modulos/mi-dia/mi-dia.service.js';
import type { MiDiaSalidaDatos } from '../../modulos/mi-dia/mi-dia.tipos.js';
import type { UsuarioSesion } from '../auth/tipos.js';

export const JOB_RESUMEN_DIARIO = 'avisos.resumen_diario';

// Mensaje de §8.2 (formato compartido con /hoy del bot) o null si no hay nada que mostrar.
export function construirResumen(d: MiDiaSalidaDatos): string | null {
  return formatearMiDia(d, { url: `${env.WEB_URL}/mi-dia` });
}

interface Destinatario {
  id: number;
  nombre: string;
  rol: Rol;
  chat_id: string;
}

// `cargarMiDia` solo usa `id` y `permisos` del actor.
function actorDe(u: Destinatario): UsuarioSesion {
  return {
    id: u.id,
    nombre: u.nombre,
    correo: '',
    rol: u.rol,
    permisos: PERMISOS_POR_ROL[u.rol],
    debe_cambiar_contrasena: false,
    debe_aceptar_terminos: false,
    sesion_id: '',
    origen: 'web',
    autenticado_por: 'cookie',
  };
}

export interface ResultadoResumen {
  enviados: number;
  omitidos: number;
  fallidos: number;
  feriado: boolean;
}

// Resumen diario por Telegram (spec fase 6 §8.2): un mensaje por persona con vínculo y preferencia activa
// y algo que mostrar. Sin fila `aviso`. Omitido en feriados generales. Logs: solo ids y conteos.
export async function ejecutarResumenDiario(jobId?: string): Promise<ResultadoResumen> {
  const inicio = Date.now();
  logger.debug({ job: JOB_RESUMEN_DIARIO, job_id: jobId }, 'job iniciado');
  const resultado: ResultadoResumen = { enviados: 0, omitidos: 0, fallidos: 0, feriado: false };
  try {
    const hoy = hoyEnSantiago();
    const [feriado]: unknown[] = await dataSource.query(
      `SELECT 1 FROM feriado WHERE fecha = $1::date AND departamento_id IS NULL`,
      [hoy],
    );
    if (feriado) {
      resultado.feriado = true;
    } else if (!env.TELEGRAM_BOT_TOKEN) {
      logger.info(
        { job: JOB_RESUMEN_DIARIO, job_id: jobId },
        'resumen diario sin token de Telegram',
      );
    } else {
      const usuarios: Destinatario[] = await dataSource.query(
        `SELECT u.id, u.nombre, u.rol, v.chat_id::text AS chat_id
           FROM usuario u
           JOIN vinculo_telegram v ON v.usuario_id = u.id
           LEFT JOIN preferencia_aviso p
             ON p.usuario_id = u.id AND p.evento = 'resumen_diario' AND p.canal = 'telegram'
          WHERE u.activo AND COALESCE(p.activo, $1::boolean)
          ORDER BY u.id`,
        [PREFERENCIAS_POR_DEFECTO.resumen_diario.telegram],
      );
      for (const u of usuarios) {
        try {
          const texto = construirResumen(await cargarMiDia(dataSource.manager, actorDe(u)));
          if (texto === null) {
            resultado.omitidos++;
            continue;
          }
          await enviarMensaje(Number(u.chat_id), texto);
          resultado.enviados++;
        } catch (err) {
          resultado.fallidos++;
          // Nunca el mensaje del error (la URL de Telegram lleva el token): solo el código
          logger.warn(
            {
              job: JOB_RESUMEN_DIARIO,
              job_id: jobId,
              usuario_id: u.id,
              codigo: err instanceof ErrorTelegram ? err.codigo : 'error',
            },
            'no se pudo enviar el resumen diario',
          );
        }
      }
    }
    logger.info(
      { job: JOB_RESUMEN_DIARIO, job_id: jobId, duracion_ms: Date.now() - inicio, ...resultado },
      'job terminado',
    );
    return resultado;
  } catch (err) {
    logger.error(
      { err, job: JOB_RESUMEN_DIARIO, job_id: jobId, duracion_ms: Date.now() - inicio },
      'job fallido',
    );
    throw err;
  }
}

// Cola, worker y programación: 08:30 de lunes a viernes (America/Santiago).
export async function registrarJobResumenDiario(boss: PgBoss): Promise<void> {
  await boss.createQueue(JOB_RESUMEN_DIARIO);
  await boss.work(JOB_RESUMEN_DIARIO, async ([job]) => {
    await ejecutarResumenDiario(job?.id);
  });
  await boss.schedule(JOB_RESUMEN_DIARIO, '30 8 * * 1-5', {}, { tz: ZONA });
}
