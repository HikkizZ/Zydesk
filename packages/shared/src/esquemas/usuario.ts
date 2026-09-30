import { z } from 'zod';
import { ROLES } from '../enums/rol.js';
import { contrasena } from './auth.js';
import { color, correo, id, instante, referencia, texto } from './comunes.js';

export const UsuarioSalida = z.object({
  id,
  nombre: z.string(),
  correo: z.string(),
  rol: z.enum(ROLES),
  departamento_id: id.nullable(),
  departamento: referencia.nullable(),
  activo: z.boolean(),
  color_avatar: z.string(),
  iniciales: z.string(),
  debe_cambiar_contrasena: z.boolean(),
  ultimo_ingreso: instante.nullable(),
  creado_en: instante,
  actualizado_en: instante,
});

export const UsuarioCrearEntrada = z.object({
  nombre: texto(120),
  correo,
  rol: z.enum(ROLES),
  departamento_id: id.nullable(),
  color_avatar: color.optional(),
  contrasena_temporal: contrasena,
});

export const UsuarioEditarEntrada = UsuarioCrearEntrada.omit({
  contrasena_temporal: true,
}).partial();

// sin paginar (≤ 50 personas)
export const UsuariosQuery = z.object({
  activo: z.enum(['true', 'false']).optional(),
  rol: z.enum(ROLES).optional(),
  q: texto(80).optional(),
});

export const RestablecerSalida = z.object({ contrasena_temporal: z.string() });

export type UsuarioSalidaDatos = z.infer<typeof UsuarioSalida>;
export type UsuarioCrearEntradaDatos = z.infer<typeof UsuarioCrearEntrada>;
export type UsuarioEditarEntradaDatos = z.infer<typeof UsuarioEditarEntrada>;
export type UsuariosQueryDatos = z.infer<typeof UsuariosQuery>;
export type RestablecerSalidaDatos = z.infer<typeof RestablecerSalida>;
