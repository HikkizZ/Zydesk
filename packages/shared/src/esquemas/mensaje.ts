import { z } from 'zod';
import { TIPOS_MENSAJE } from '../enums/ticket.js';
import { ArchivoSalida } from './archivo.js';
import { UsuarioBreve, id, instante, texto } from './comunes.js';

export const MensajeEntrada = z.object({
  tipo: z.enum(TIPOS_MENSAJE),
  texto: texto(20_000),
  archivo_ids: z.array(id).max(10).default([]),
  mencionados_ids: z.array(id).max(20).default([]),
  horas: z.number().min(0.25).max(24).multipleOf(0.25).nullable().default(null),
  copiar_al_ticket: z.boolean().default(false), // solo OT; en ticket debe ser false (400)
});

// GET /api/tickets/:id/mensajes
export const MensajesQuery = z.object({ tipo: z.enum(TIPOS_MENSAJE).optional() });

export const MensajeSalida = z.object({
  id,
  ticket_id: id.nullable(),
  ot_id: id.nullable(),
  tipo: z.enum(TIPOS_MENSAJE),
  autor: UsuarioBreve.nullable(),
  texto: z.string(),
  horas: z.number().nullable(),
  archivos: z.array(ArchivoSalida),
  mencionados: z.array(UsuarioBreve),
  creado_en: instante,
  // mensaje del ticket copiado desde una OT
  copiado_de: z.object({ mensaje_id: id, ot: z.object({ id, codigo: z.string() }) }).nullable(),
  // mensaje de OT que ya tiene copia en el ticket
  copiado_al_ticket: z.boolean(),
});
