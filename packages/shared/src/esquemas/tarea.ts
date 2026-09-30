import { z } from 'zod';
import { UsuarioBreve, fechaIso, id, instante, texto } from './comunes.js';

export const TareaEntrada = z.object({
  titulo: texto(200),
  responsable_id: id.nullable().default(null),
  fecha: fechaIso.nullable().default(null),
});

export const TareaEditarEntrada = TareaEntrada.partial().extend({ hecha: z.boolean().optional() });

export const TareaSalida = z.object({
  id,
  ticket_id: id,
  titulo: z.string(),
  responsable: UsuarioBreve.nullable(),
  fecha: fechaIso.nullable(),
  hecha: z.boolean(),
  hecha_en: instante.nullable(),
  orden: z.number(),
  vencida: z.boolean(), // fecha < hoy (Santiago) y no hecha
  creado_en: instante,
  actualizado_en: instante,
});
