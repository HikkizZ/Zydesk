import { z } from 'zod';
import { UNIDADES_PLAZO } from '../enums/plazo.js';
import { id, instante, referencia, texto } from './comunes.js';

// Se llama PlazoEsquema para no chocar con el tipo `Plazo` del motor de horas hábiles.
export const PlazoEsquema = z.object({
  valor: z.number().int().min(1).max(999),
  unidad: z.enum(UNIDADES_PLAZO),
});

export const CategoriaEntrada = z.object({
  nombre: texto(80),
  responsable_defecto_id: id.nullable(),
  plazo_respuesta: PlazoEsquema,
  plazo_resolucion: z.object({
    urgente: PlazoEsquema,
    alta: PlazoEsquema,
    media: PlazoEsquema,
    baja: PlazoEsquema,
  }),
});

export const CategoriaSalida = CategoriaEntrada.extend({
  id,
  responsable_defecto: referencia.nullable(),
  activo: z.boolean(),
  creado_en: instante,
  actualizado_en: instante,
});

export const CategoriasQuery = z.object({ activo: z.enum(['true', 'false']).optional() });

export type CategoriaEntradaDatos = z.infer<typeof CategoriaEntrada>;
export type CategoriaSalidaDatos = z.infer<typeof CategoriaSalida>;
