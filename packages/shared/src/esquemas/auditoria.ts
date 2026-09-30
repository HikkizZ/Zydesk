import { z } from 'zod';
import { esquemaPaginacion, id, instante, texto } from './comunes.js';

export const ACCIONES_AUDITORIA = [
  'ingreso_ok',
  'ingreso_fallido',
  'cierre_sesion',
  'sesion_cerrada',
  'cuenta_bloqueada',
  'contrasena_cambiada',
  'contrasena_restablecida',
  'usuario_creado',
  'usuario_desactivado',
  'usuario_reactivado',
  'rol_cambiado',
  'config_cambiada',
  'numeracion_cambiada',
  'terminos_aceptados',
  'exportacion',
  'descarga_archivo',
] as const;

export const AuditoriaQuery = esquemaPaginacion.extend({
  accion: z.enum(ACCIONES_AUDITORIA).optional(),
  usuario_id: z.coerce.number().int().positive().optional(),
  correo: texto(200).optional(),
  desde: instante.optional(),
  hasta: instante.optional(),
});

export const AuditoriaSalida = z.object({
  id,
  creado_en: instante,
  accion: z.string(),
  usuario: z.object({ id, nombre: z.string() }).nullable(),
  ip: z.string().nullable(),
  req_id: z.string().nullable(),
  detalle: z.record(z.string(), z.unknown()),
});

export type AuditoriaQueryDatos = z.infer<typeof AuditoriaQuery>;
export type AuditoriaSalidaDatos = z.infer<typeof AuditoriaSalida>;
