import type { RequestHandler } from 'express';
import { ErrorApp } from '../errores/error-app.js';
import { nombreCookie, entornoDe } from './cookie.js';

const MUTACIONES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ADR 0018 §3: toda mutación con cookie exige `X-Requested-With: Zydesk`. Con `Authorization: Bearer`
// (bot) y sin cookie de sesión no se exige (un sitio ajeno no puede fijar esa cabecera). Tampoco en
// `/api/bot/*` sin cookie: esas rutas solo aceptan la clave compartida `X-Bot-Key` (spec fase 6 §9.3), que un
// sitio ajeno no puede enviar; sin ella responden 401 `CLAVE_BOT_INVALIDA`, no 403 `CSRF`.
export const csrf: RequestHandler = (req, _res, next) => {
  if (!MUTACIONES.has(req.method)) return next();
  const cookies = req.cookies as Record<string, string> | undefined;
  const conCookie = Boolean(cookies?.[nombreCookie(entornoDe(req))]);
  const bearer = /^Bearer\s+\S+/i.test(req.header('authorization') ?? '');
  const rutaBot = req.originalUrl.startsWith('/api/bot/');
  if ((bearer || rutaBot) && !conCookie) return next();
  if (req.header('x-requested-with') === 'Zydesk') return next();
  next(new ErrorApp('CSRF', 'Petición rechazada'));
};
