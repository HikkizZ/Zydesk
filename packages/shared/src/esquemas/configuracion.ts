import { z } from 'zod';
import { id, instante, texto } from './comunes.js';

export const MarcaEntrada = z.object({ nombre_app: texto(40) });

export const MarcaSalida = z.object({ nombre_app: z.string(), logo_url: z.string().nullable() });

export const LogoEntrada = z.object({
  tipo_mime: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']),
  base64: z.string().max(280_000), // ≈ 200 KB
});

export const NumeracionTipo = z.object({
  prefijo: z.string().trim().max(10),
  inicial: z.number().int().min(0).max(99_999_999),
  digitos: z.number().int().min(3).max(8),
  modo: z.enum(['correlativo', 'aleatorio']),
});

export const NumeracionEntrada = z.object({
  ticket: NumeracionTipo,
  ot: NumeracionTipo.omit({ modo: true }),
});

const EstadoNumeracion = {
  ultimo_usado: z.number().nullable(),
  usados: z.number(),
  capacidad: z.number(),
  advertencia: z.boolean(),
};

export const NumeracionSalida = z.object({
  ticket: NumeracionTipo.extend(EstadoNumeracion),
  ot: NumeracionTipo.extend({ modo: z.literal('correlativo'), ...EstadoNumeracion }),
});

export const EventoSalida = z.object({
  id,
  creado_en: instante,
  autor: z.object({ id, nombre: z.string() }).nullable(),
  entidad_id: z.string(),
  valor_anterior: z.string().nullable(),
  valor_nuevo: z.string().nullable(),
});

export type MarcaEntradaDatos = z.infer<typeof MarcaEntrada>;
export type MarcaSalidaDatos = z.infer<typeof MarcaSalida>;
export type LogoEntradaDatos = z.infer<typeof LogoEntrada>;
export type NumeracionEntradaDatos = z.infer<typeof NumeracionEntrada>;
export type NumeracionSalidaDatos = z.infer<typeof NumeracionSalida>;
export type EventoSalidaDatos = z.infer<typeof EventoSalida>;
