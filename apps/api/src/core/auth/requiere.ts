import type { Request, RequestHandler } from 'express';
import { ErrorApp } from '../errores/error-app.js';
import type { PermisoRuta, UsuarioSesion } from './tipos.js';

// Rutas permitidas aunque falte cambiar la contraseña o aceptar los términos (método + ruta declarada).
const LISTA_BLANCA = new Set([
  'GET /api/yo',
  'POST /api/auth/salir',
  'POST /api/yo/cambiar-contrasena',
  'POST /api/yo/aceptar-terminos',
  'GET /api/legal/:clave',
  'GET /api/yo/sesiones',
  'DELETE /api/yo/sesiones',
  'DELETE /api/yo/sesiones/:id',
]);

function enListaBlanca(req: Request): boolean {
  const ruta = (req.route as { path?: string } | undefined)?.path ?? req.baseUrl + req.path;
  return LISTA_BLANCA.has(`${req.method} ${ruta}`);
}

// Sin actor → 401; contraseña pendiente → 403 antes que términos pendientes; después, el permiso.
export function requiere(permiso: PermisoRuta | PermisoRuta[]): RequestHandler {
  const aceptados = Array.isArray(permiso) ? permiso : [permiso];
  return (req, res, next) => {
    const actor = res.locals['actor'] as UsuarioSesion | null | undefined;
    if (!actor) return next(new ErrorApp('NO_AUTENTICADO', 'Inicia sesión'));
    if (!enListaBlanca(req)) {
      if (actor.debe_cambiar_contrasena) {
        return next(
          new ErrorApp('CONTRASENA_PENDIENTE', 'Debes cambiar tu contraseña para continuar'),
        );
      }
      if (actor.debe_aceptar_terminos) {
        return next(
          new ErrorApp('TERMINOS_PENDIENTES', 'Debes aceptar los términos de uso para continuar'),
        );
      }
    }
    const permitido = aceptados.some(
      (p) => p === 'sesion' || p === 'publico' || actor.permisos.includes(p),
    );
    if (!permitido) return next(new ErrorApp('SIN_PERMISO', 'No tienes permiso para esta acción'));
    next();
  };
}

// Para handlers de rutas con permiso distinto de 'publico': estrecha `actor` a no nulo.
export function actorRequerido(actor: UsuarioSesion | null): UsuarioSesion {
  if (!actor) throw new ErrorApp('NO_AUTENTICADO', 'Inicia sesión');
  return actor;
}
