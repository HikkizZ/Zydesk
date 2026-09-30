import type { RequestHandler } from 'express';
import { ErrorApp } from '../errores/error-app.js';
import { nombreCookie, entornoDe } from './cookie.js';

const MUTACIONES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ADR 0018 §3: toda mutación con cookie exige `X-Requested-With: Zydesk`. Con `Authorization: Bearer`
// (bot) y sin cookie de sesión no se exige (un sitio ajeno no puede fijar esa cabecera).
export const csrf: RequestHandler = (req, _res, next) => {
  if (!MUTACIONES.has(req.method)) return next();
  const cookies = req.cookies as Record<string, string> | undefined;
  const conCookie = Boolean(cookies?.[nombreCookie(entornoDe(req))]);
  const bearer = /^Bearer\s+\S+/i.test(req.header('authorization') ?? '');
  if (bearer && !conCookie) return next();
  if (req.header('x-requested-with') === 'Zydesk') return next();
  next(new ErrorApp('CSRF', 'Petición rechazada'));
};
