import { z } from 'zod';
import { ORIGENES_SESION } from '../enums/origen-sesion.js';
import { ROLES } from '../enums/rol.js';
import { PERMISOS } from '../permisos.js';
import { correo, id, instante, referencia } from './comunes.js';
import { CONTRASENAS_COMUNES } from './contrasenas-comunes.js';

export type ResultadoPolitica =
  { ok: true } | { ok: false; motivo: 'corta' | 'igual_correo' | 'comun' };

// Política de contraseñas (§5.6): usada por la API (CONTRASENA_DEBIL) y por la web.
export function politicaContrasena(contrasena: string, correoUsuario: string): ResultadoPolitica {
  if (contrasena.length < 10) return { ok: false, motivo: 'corta' };
  const c = contrasena.toLowerCase();
  const correoMin = correoUsuario.trim().toLowerCase();
  const local = correoMin.split('@')[0] ?? '';
  if (c === correoMin || (local !== '' && c === local)) {
    return { ok: false, motivo: 'igual_correo' };
  }
  if (CONTRASENAS_COMUNES.includes(c)) return { ok: false, motivo: 'comun' };
  return { ok: true };
}

// Acota la longitud; la política completa se aplica con `politicaContrasena` (necesita el correo).
export const contrasena = z.string().min(10).max(200);

export const IngresoEntrada = z.object({
  correo,
  contrasena: z.string().min(1).max(200),
  mantener: z.boolean().default(false),
});

// `nueva` solo se acota en longitud máxima: la política (corta / igual al correo / común) la
// aplica `politicaContrasena` y la API responde 400 CONTRASENA_DEBIL con el motivo.
export const CambiarContrasenaEntrada = z
  .object({
    actual: z.string().min(1).max(200),
    nueva: z.string().min(1).max(200),
  })
  .refine((v) => v.nueva !== v.actual, {
    path: ['nueva'],
    message: 'La nueva contraseña debe ser distinta de la actual',
  });

export const YoSalida = z.object({
  id,
  nombre: z.string(),
  correo: z.string(),
  rol: z.enum(ROLES),
  departamento: referencia.nullable(),
  color_avatar: z.string(),
  iniciales: z.string(),
  permisos: z.array(z.enum(PERMISOS)),
  debe_cambiar_contrasena: z.boolean(),
  debe_aceptar_terminos: z.boolean(),
  terminos_version_vigente: z.string(),
  nombre_app: z.string(),
  logo_url: z.string().nullable(),
});

export const SesionSalida = z.object({
  id: z.string().uuid(),
  origen: z.enum(ORIGENES_SESION),
  ip: z.string().nullable(),
  user_agent: z.string().nullable(),
  creada_en: instante,
  ultimo_uso: instante,
  expira_en: instante,
  mantener: z.boolean(),
  actual: z.boolean(),
});

export const AceptarTerminosEntrada = z.object({ version: z.string().min(1) });

export type IngresoEntradaDatos = z.infer<typeof IngresoEntrada>;
export type CambiarContrasenaEntradaDatos = z.infer<typeof CambiarContrasenaEntrada>;
export type YoSalidaDatos = z.infer<typeof YoSalida>;
export type SesionSalidaDatos = z.infer<typeof SesionSalida>;
export type AceptarTerminosEntradaDatos = z.infer<typeof AceptarTerminosEntrada>;
