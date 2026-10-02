import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { dataSource } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ErrorApp } from '../errores/error-app.js';
import { registrarAuditoria } from '../historial/auditoria.js';
import { ipReal } from './ip.js';

const LIMITE_FALLOS_POR_IP = 20;

// Comparación en tiempo constante: si las longitudes difieren se compara contra sí misma y falla igual.
export function claveBotValida(recibida: string | undefined): boolean {
  const esperada = env.BOT_API_KEY;
  if (!esperada) return false;
  const a = Buffer.from(recibida ?? '', 'utf8');
  const b = Buffer.from(esperada, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

// `/api/bot/*` (solo `POST /api/bot/vincular`): autentica con la clave compartida `X-Bot-Key` (spec fase 6
// §9.3). Más de 20 fallos por IP en 15 minutos (clave o código) → 429. La clave no identifica a nadie.
export const requiereClaveBot: RequestHandler = async (req, _res, next) => {
  try {
    const ip = ipReal(req);
    if (ip) {
      const [r]: { total: number }[] = await dataSource.query(
        `SELECT count(*)::int AS total FROM auditoria
          WHERE ip = $1::inet AND accion = 'telegram_vinculacion_fallida'
            AND creado_en > now() - interval '15 minutes'`,
        [ip],
      );
      if ((r?.total ?? 0) >= LIMITE_FALLOS_POR_IP) {
        return next(
          new ErrorApp(
            'VINCULACION_BLOQUEADA',
            'Demasiados intentos. Vuelve a intentarlo más tarde.',
          ),
        );
      }
    }
    if (!claveBotValida(req.header('x-bot-key'))) {
      logger.warn({ ip }, 'clave del bot inválida');
      await registrarAuditoria(null, {
        accion: 'telegram_vinculacion_fallida',
        detalle: { motivo: 'clave' },
      });
      return next(new ErrorApp('CLAVE_BOT_INVALIDA', 'Clave del bot inválida'));
    }
    next();
  } catch (err) {
    next(err);
  }
};
