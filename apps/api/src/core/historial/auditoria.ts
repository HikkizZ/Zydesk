import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import { contexto } from '../http/contexto.js';

export type AccionAuditoria =
  | 'ingreso_ok'
  | 'ingreso_fallido'
  | 'cierre_sesion'
  | 'sesion_cerrada'
  | 'cuenta_bloqueada'
  | 'contrasena_cambiada'
  | 'contrasena_restablecida'
  | 'usuario_creado'
  | 'usuario_desactivado'
  | 'usuario_reactivado'
  | 'rol_cambiado'
  | 'config_cambiada'
  | 'numeracion_cambiada'
  | 'terminos_aceptados'
  | 'exportacion'
  | 'descarga_archivo'
  | 'telegram_vinculado'
  | 'telegram_vinculacion_fallida'
  | 'telegram_desvinculado';

// `detalle` nunca lleva contraseñas ni contenido; solo ids, correo, user_agent y valores de configuración.
export async function registrarAuditoria(
  tx: EntityManager | null,
  a: {
    accion: AccionAuditoria;
    usuario_id?: number | null;
    detalle?: Record<string, unknown>;
  },
): Promise<void> {
  const ctx = contexto.getStore();
  await (tx ?? dataSource.manager).query(
    `INSERT INTO auditoria (req_id, usuario_id, ip, accion, detalle) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      ctx?.req_id ?? null,
      a.usuario_id ?? null,
      ctx?.ip ?? null,
      a.accion,
      JSON.stringify(a.detalle ?? {}),
    ],
  );
}
