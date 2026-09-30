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
});

// GET /api/tickets/:id/mensajes
export const MensajesQuery = z.object({ tipo: z.enum(TIPOS_MENSAJE).optional() });

export const MensajeSalida = z.object({
  id,
  ticket_id: id,
  tipo: z.enum(TIPOS_MENSAJE),
  autor: UsuarioBreve.nullable(),
  texto: z.string(),
  horas: z.number().nullable(),
  archivos: z.array(ArchivoSalida),
  mencionados: z.array(UsuarioBreve),
  creado_en: instante,
});
