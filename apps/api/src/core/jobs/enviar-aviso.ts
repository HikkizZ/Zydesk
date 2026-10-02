import type PgBoss from 'pg-boss';
import { CanalTelegram } from '../../avisos/canales/telegram.js';
import type { AvisoParaEnviar, Canal } from '../../avisos/canales/canal.js';
import { dataSource } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ErrorTelegram } from '../../integraciones/telegram/cliente.js';
import { enTransaccion } from '../historial/transaccion.js';

export const COLA_ENVIAR_AVISO = 'aviso.enviar';

// Encola el envío de un aviso por un canal externo. `singletonKey` evita encolar dos veces el mismo
// (aviso, canal).
export function encolarEnvio(
  boss: PgBoss,
  aviso_id: number | string,
  canal: 'telegram' | 'correo',
): Promise<string | null> {
  return boss.send(
    COLA_ENVIAR_AVISO,
    { aviso_id: Number(aviso_id), canal },
    { singletonKey: `${aviso_id}:${canal}` },
  );
}

interface FilaEnvio {
  estado: 'pendiente' | 'enviado' | 'fallido' | 'omitido';
  intentos: number;
  tipo: string;
  texto: string;
  enlace: string;
  entidad: 'ticket' | 'ot';
  entidad_id: number;
  datos: Record<string, unknown>;
  chat_id: string | null;
}

async function marcar(
  aviso_id: number,
  estado: 'enviado' | 'fallido' | 'omitido',
  error: string | null,
  cuenta_intento: boolean,
): Promise<void> {
  await enTransaccion(async (tx) => {
    await tx.query(
      `UPDATE aviso_envio
          SET estado = $2, error = $3, intentos = intentos + $4, actualizado_en = now(),
              enviado_en = CASE WHEN $2 = 'enviado' THEN now() ELSE enviado_en END
        WHERE aviso_id = $1 AND canal = 'telegram'`,
      [aviso_id, estado, error, cuenta_intento ? 1 : 0],
    );
    if (estado === 'enviado') {
      await tx.query(
        `UPDATE vinculo_telegram SET ultimo_envio_en = now()
          WHERE usuario_id = (SELECT usuario_id FROM aviso WHERE id = $1)`,
        [aviso_id],
      );
    }
  });
}

// Procesa un intento de envío. `ultimo_intento`: si es el último que pg-boss concede, un error de
// `reintentar` deja el envío `fallido` en vez de relanzar. Solo ids y códigos en los logs.
export async function enviarAvisoTelegram(
  aviso_id: number,
  contexto: { job_id?: string; intento: number; ultimo_intento: boolean },
  canal: Canal = new CanalTelegram(),
): Promise<void> {
  const base = { job_id: contexto.job_id, aviso_id, intento: contexto.intento };
  const [fila]: FilaEnvio[] = await dataSource.query(
    `SELECT e.estado, e.intentos, a.tipo, a.texto, a.enlace, a.entidad, a.entidad_id, a.datos,
            v.chat_id::text AS chat_id
       FROM aviso_envio e
       JOIN aviso a ON a.id = e.aviso_id
       LEFT JOIN vinculo_telegram v ON v.usuario_id = a.usuario_id
      WHERE e.aviso_id = $1 AND e.canal = 'telegram'`,
    [aviso_id],
  );
  if (!fila || fila.estado !== 'pendiente') {
    logger.debug(base, 'aviso sin envío pendiente');
    return;
  }
  if (!fila.chat_id) {
    await marcar(aviso_id, 'omitido', 'sin_vinculo', false);
    logger.info({ ...base, codigo: 'sin_vinculo' }, 'envío omitido');
    return;
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    await marcar(aviso_id, 'omitido', 'sin_token', false);
    logger.info({ ...base, codigo: 'sin_token' }, 'envío omitido');
    return;
  }
  const aviso: AvisoParaEnviar = {
    id: aviso_id,
    tipo: fila.tipo,
    texto: fila.texto,
    enlace: fila.enlace,
    entidad: fila.entidad,
    entidad_id: fila.entidad_id,
    datos: fila.datos,
  };
  try {
    await canal.enviar(aviso, { chat_id: Number(fila.chat_id) });
  } catch (err) {
    if (!(err instanceof ErrorTelegram)) {
      // Un error inesperado se trata como reintentable, sin copiar su mensaje
      logger.error({ ...base }, 'error inesperado al enviar por Telegram');
      return reintentar(aviso_id, 'error', contexto, base);
    }
    if (err.tipo === 'definitivo') {
      await marcar(aviso_id, 'fallido', err.codigo, true);
      logger.warn({ ...base, codigo: err.codigo }, 'envío por Telegram fallido');
      return;
    }
    return reintentar(aviso_id, err.codigo, contexto, base);
  }
  await marcar(aviso_id, 'enviado', null, true);
  logger.debug(base, 'aviso enviado por Telegram');
}

async function reintentar(
  aviso_id: number,
  codigo: string,
  contexto: { ultimo_intento: boolean },
  base: Record<string, unknown>,
): Promise<void> {
  if (contexto.ultimo_intento) {
    await marcar(aviso_id, 'fallido', codigo, true);
    logger.warn({ ...base, codigo }, 'envío por Telegram fallido tras los reintentos');
    return;
  }
  await dataSource.query(
    `UPDATE aviso_envio SET intentos = intentos + 1, error = $2, actualizado_en = now()
      WHERE aviso_id = $1 AND canal = 'telegram'`,
    [aviso_id, codigo],
  );
  logger.warn({ ...base, codigo }, 'envío por Telegram a reintentar');
  throw new ErrorTelegram('reintentar', codigo);
}

// Cola con 3 reintentos y backoff (spec fase 6 §7.3) y su worker.
export async function registrarJobEnviarAviso(boss: PgBoss): Promise<void> {
  await boss.createQueue(COLA_ENVIAR_AVISO, {
    name: COLA_ENVIAR_AVISO,
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 300,
  });
  await boss.work(COLA_ENVIAR_AVISO, { includeMetadata: true }, async ([job]) => {
    if (!job) return;
    const datos = job.data as { aviso_id: number; canal: 'telegram' | 'correo' };
    // El canal `correo` no se implementa (ADR 0013)
    if (datos.canal !== 'telegram') return;
    await enviarAvisoTelegram(datos.aviso_id, {
      job_id: job.id,
      intento: job.retryCount + 1,
      ultimo_intento: job.retryCount >= job.retryLimit,
    });
  });
}
