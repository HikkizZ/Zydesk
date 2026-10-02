import { z } from 'zod';
import { TIPOS_OT } from '../enums/ot.js';
import { PRIORIDADES } from '../enums/prioridad.js';
import { ESTADOS_TICKET } from '../enums/ticket.js';
import { ClienteBreve, Responsable, UsuarioBreve, fechaIso, id, instante } from './comunes.js';

const DIA_MS = 86_400_000;
const MAX_DIAS_RANGO = 62;

export const LineaTiempoQuery = z
  .object({ desde: fechaIso, hasta: fechaIso })
  .refine((v) => v.hasta >= v.desde, {
    path: ['hasta'],
    message: 'hasta no puede ser anterior a desde',
  })
  .refine((v) => (Date.parse(v.hasta) - Date.parse(v.desde)) / DIA_MS <= MAX_DIAS_RANGO, {
    path: ['hasta'],
    message: `El rango no puede superar ${MAX_DIAS_RANGO} días`,
  });

export const ItemLineaTiempo = z.object({
  id,
  codigo: z.string(),
  asunto: z.string(),
  estado: z.enum(ESTADOS_TICKET),
  prioridad: z.enum(PRIORIDADES),
  inicio: fechaIso, // fecha (Santiago) de inicio_planificado, si no de creado_en
  limite: fechaIso.nullable(), // fecha_limite; null = "sin fecha" (barra de ancho mínimo)
  vencido: z.boolean(),
  cerrado: z.boolean(),
  responsable_id: id.nullable(),
  responsables: z.array(Responsable),
  cliente: ClienteBreve.nullable(),
  ot_vinculada: z.object({ id, codigo: z.string(), tipo: z.enum(TIPOS_OT) }).nullable(),
  actualizado_en: instante,
});

export const DiaLineaTiempo = z.object({
  fecha: fechaIso,
  habil: z.boolean(),
  feriado: z.string().nullable(),
  hoy: z.boolean(),
});

export const LineaTiempoSalida = z.object({
  dias: z.array(DiaLineaTiempo),
  items: z.array(ItemLineaTiempo),
  vencidos: z.number(),
  personas: z.array(UsuarioBreve), // activos, para filas vacías en modo persona
});
