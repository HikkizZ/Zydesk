import type { RequestHandler } from 'express';
import { PERMISOS_POR_ROL, type OrigenSesion, type Rol } from '@zydesk/shared';
import { dataSource } from '../../config/db.js';
import { versionTerminosVigente } from '../../modulos/legal/legal.service.js';
import { contexto } from '../http/contexto.js';
import { entornoDe, nombreCookie } from './cookie.js';
import { INTERVALOS_SESION, hashToken } from './sesiones.js';
import type { UsuarioSesion } from './tipos.js';

interface FilaSesion {
  sesion_id: string;
  mantener: boolean;
  origen: OrigenSesion;
  vencida: boolean;
  usuario_id: number;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  debe_cambiar_contrasena: boolean;
  terminos_version: string | null;
}

// Cookie o, si no hay cookie, `Authorization: Bearer <token>` (bot, Fase 6). Ante cualquier fallo
// sigue con `res.locals.actor = null`; `requiere()` decide si eso es un 401.
export const autenticar: RequestHandler = async (req, res, next) => {
  res.locals['actor'] = null;
  try {
    const cookies = req.cookies as Record<string, string> | undefined;
    let token = cookies?.[nombreCookie(entornoDe(req))];
    let via: UsuarioSesion['autenticado_por'] = 'cookie';
    if (!token) {
      const m = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
      if (m) {
        token = m[1];
        via = 'bearer';
      }
    }
    if (!token) return next();

    const filas: FilaSesion[] = await dataSource.query(
      `SELECT s.id AS sesion_id, s.mantener, s.origen,
              (s.expira_en <= now() OR s.expira_max_en <= now()) AS vencida,
              u.id AS usuario_id, u.nombre, u.correo, u.rol, u.activo,
              u.debe_cambiar_contrasena, u.terminos_version
         FROM sesion s JOIN usuario u ON u.id = s.usuario_id
        WHERE s.token_hash = $1`,
      [hashToken(token)],
    );
    const f = filas[0];
    if (!f) return next();
    if (f.vencida) {
      await dataSource.query(`DELETE FROM sesion WHERE id = $1`, [f.sesion_id]);
      return next();
    }
    if (!f.activo) return next();

    // La expiración se desliza en cada petición, pero solo se escribe si `ultimo_uso` tiene > 5 min.
    const i = f.mantener ? INTERVALOS_SESION.mantener : INTERVALOS_SESION.normal;
    await dataSource.query(
      `UPDATE sesion SET ultimo_uso = now(), expira_en = LEAST(now() + $2::interval, expira_max_en)
        WHERE id = $1 AND ultimo_uso < now() - interval '5 minutes'`,
      [f.sesion_id, i.inactividad],
    );

    const actor: UsuarioSesion = {
      id: f.usuario_id,
      nombre: f.nombre,
      correo: f.correo,
      rol: f.rol,
      permisos: PERMISOS_POR_ROL[f.rol],
      debe_cambiar_contrasena: f.debe_cambiar_contrasena,
      debe_aceptar_terminos: f.terminos_version !== versionTerminosVigente(),
      sesion_id: f.sesion_id,
      origen: f.origen,
      autenticado_por: via,
    };
    res.locals['actor'] = actor;
    const ctx = contexto.getStore();
    if (ctx) Object.assign(ctx, { usuario_id: actor.id, sesion_id: actor.sesion_id });
    next();
  } catch (err) {
    next(err);
  }
};
