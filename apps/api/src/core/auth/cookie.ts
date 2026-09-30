import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env.js';

type Entorno = 'development' | 'test' | 'production';

// ADR 0018 §2: `__Host-` exige Secure (HTTPS), por eso solo en producción.
export function nombreCookie(entorno: Entorno = env.NODE_ENV): string {
  return entorno === 'production' ? '__Host-sesion' : 'sesion';
}

export const NOMBRE_COOKIE = nombreCookie();

// El entorno se toma de la app (`app.set('entorno')`) para poder probar el modo producción.
export function entornoDe(req: Request): Entorno {
  return (req.app.get('entorno') as Entorno | undefined) ?? env.NODE_ENV;
}

function opciones(entorno: Entorno): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', path: '/', secure: entorno === 'production' };
}

// `maxAge` solo con `mantener` (= expira_max_en − ahora); sin `mantener` es cookie de sesión del navegador.
export function fijarCookie(
  req: Request,
  res: Response,
  token: string,
  sesion: { mantener: boolean; expira_max_en: Date },
): void {
  const entorno = entornoDe(req);
  const o = opciones(entorno);
  if (sesion.mantener) o.maxAge = Math.max(0, sesion.expira_max_en.getTime() - Date.now());
  res.cookie(nombreCookie(entorno), token, o);
}

export function borrarCookie(req: Request, res: Response): void {
  const entorno = entornoDe(req);
  res.clearCookie(nombreCookie(entorno), opciones(entorno));
}
