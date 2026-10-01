import { z } from 'zod';
import { ETAPAS_OT, TIPOS_OT } from '../enums/ot.js';
import { TIPOS_MENSAJE } from '../enums/ticket.js';
import {
  ClienteBreve,
  UsuarioBreve,
  fechaIso,
  id,
  idQuery,
  instante,
  referencia,
  texto,
} from './comunes.js';

// mismo rango que MensajeEntrada.horas
const horas = z.number().min(0.25).max(24).multipleOf(0.25);

export const RegistroHorasEntrada = z
  .object({
    fecha: fechaIso,
    ticket_id: id.nullable().default(null),
    ot_id: id.nullable().default(null),
    tarea_id: id.nullable().default(null),
    descripcion: texto(200).nullable().default(null), // obligatoria en "Sin ticket"; ignorada (null) con ticket u OT
    horas,
    fuera_de_horario: z.boolean().default(false),
  })
  .refine((v) => v.ticket_id === null || v.ot_id === null, {
    path: ['ot_id'],
    message: 'Indica un ticket o una OT, no ambos',
  })
  .refine((v) => v.tarea_id === null || v.ot_id !== null, {
    path: ['tarea_id'],
    message: 'La tarea requiere una OT',
  })
  .refine((v) => v.ticket_id !== null || v.ot_id !== null || v.descripcion !== null, {
    path: ['descripcion'],
    message: 'Describe el trabajo sin ticket',
  });

// Objeto explícito con todo opcional (ADR 0023.19: sin .partial()). Una fila no cambia de ticket ni de OT.
export const RegistroHorasEditar = z
  .object({
    fecha: fechaIso.optional(),
    tarea_id: id.nullable().optional(),
    descripcion: texto(200).nullable().optional(), // solo tiene efecto en "Sin ticket"
    horas: horas.optional(),
    fuera_de_horario: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que cambiar' });

export const HorasQuery = z.object({
  usuario_id: idQuery.optional(), // sin él: la persona de la sesión
  semana: fechaIso.optional(), // cualquier día; la API normaliza al lunes. Sin él: la semana de hoy (Santiago)
});

export const RegistroHorasSalida = z.object({
  id,
  usuario_id: id,
  fecha: fechaIso,
  ticket_id: id.nullable(),
  ot_id: id.nullable(),
  tarea_id: id.nullable(),
  mensaje_id: id.nullable(),
  descripcion: z.string().nullable(),
  horas: z.number(),
  fuera_de_horario: z.boolean(),
  creado_en: instante,
  actualizado_en: instante,
});

export const DestinoFila = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('ticket'),
    id,
    codigo: z.string(),
    titulo: z.string(), // asunto
    cliente: ClienteBreve.nullable(),
    cerrado: z.boolean(),
  }),
  z.object({
    tipo: z.literal('ot'),
    id,
    codigo: z.string(),
    titulo: z.string(),
    tipo_ot: z.enum(TIPOS_OT),
    etapa: z.enum(ETAPAS_OT),
    cliente: ClienteBreve.nullable(),
    final: z.boolean(),
  }),
  z.object({ tipo: z.literal('sin_ticket'), descripcion: z.string() }),
]);

export const CeldaHoras = z.object({
  fecha: fechaIso,
  total: z.number(), // Σ registros
  fuera_de_horario: z.boolean(), // alguno de los registros lo tiene
  registros: z.array(
    RegistroHorasSalida.extend({
      mensaje: z.object({ id, tipo: z.enum(TIPOS_MENSAJE) }).nullable(),
    }),
  ),
});

export const FilaHoras = z.object({
  clave: z.string(), // 'ticket:12' | 'ot:7' | 'ot:7:tarea:31' | 'sin_ticket:<descripcion>'
  destino: DestinoFila,
  tarea: z.object({ id, titulo: z.string(), hecha: z.boolean() }).nullable(),
  facturable: z.boolean(), // destino.tipo === 'ot' && tipo_ot === 'facturable'
  celdas: z.array(CeldaHoras).length(7),
  total: z.number(),
});

export const DiaPlanilla = z.object({
  fecha: fechaIso,
  dia_semana: z.number().int().min(0).max(6),
  jornada: z.number().nullable(), // horasJornada; null si la persona no tiene departamento
  feriado: z.string().nullable(), // nombre del feriado (general o del departamento) o null
  hoy: z.boolean(),
  futuro: z.boolean(),
  total: z.number(), // Σ de la columna
});

export const PlanillaSemanal = z.object({
  usuario: UsuarioBreve.extend({ departamento: referencia.nullable(), activo: z.boolean() }),
  semana: z.object({
    desde: fechaIso, // lunes
    hasta: fechaIso, // domingo
    anterior: fechaIso,
    siguiente: fechaIso,
    actual: z.boolean(),
  }),
  dias: z.array(DiaPlanilla).length(7),
  filas: z.array(FilaHoras),
  totales: z.object({
    semana: z.number(),
    facturables: z.number(),
    internas: z.number(),
    fuera_de_horario: z.number(),
    jornada_semanal: z.number().nullable(), // Σ dias.jornada
  }),
  editable: z.boolean(), // la planilla es de la sesión y tiene tickets.editar
});
