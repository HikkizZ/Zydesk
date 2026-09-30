import { z } from 'zod';
import { UsuarioBreve, fechaIso, id, instante, texto } from './comunes.js';

const horasTarea = z.number().min(0).max(999).multipleOf(0.25);

export const TareaEntrada = z.object({
  titulo: texto(200),
  responsable_id: id.nullable().default(null),
  fecha: fechaIso.nullable().default(null),
  horas_estimadas: horasTarea.nullable().default(null), // solo OT; en ticket debe ser null (400)
});

export const TareaEditarEntrada = TareaEntrada.partial().extend({
  hecha: z.boolean().optional(),
  horas_reales: horasTarea.nullable().optional(),
});

export const TareaSalida = z.object({
  id,
  ticket_id: id.nullable(),
  ot_id: id.nullable(),
  titulo: z.string(),
  responsable: UsuarioBreve.nullable(),
  fecha: fechaIso.nullable(),
  hecha: z.boolean(),
  horas_estimadas: z.number().nullable(),
  horas_reales: z.number().nullable(),
  hecha_en: instante.nullable(),
  orden: z.number(),
  vencida: z.boolean(), // fecha < hoy (Santiago) y no hecha
  creado_en: instante,
  actualizado_en: instante,
});
