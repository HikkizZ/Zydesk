import { z } from 'zod';
import { PRIORIDADES } from '../enums/prioridad.js';
import { ESPERA_DE, ESTADOS_TICKET, ORIGENES_TICKET } from '../enums/ticket.js';
import { ArchivoSalida } from './archivo.js';
import { TIPOS_TICKET } from '../enums/ot.js';
import {
  ClienteBreve,
  Responsable,
  UsuarioBreve,
  booleanoTexto,
  correo,
  csv,
  esquemaPaginacion,
  id,
  idQuery,
  instante,
  referencia,
  texto,
} from './comunes.js';
import { CorreoAdjuntoSalida } from './correo.js';
import { MensajeSalida } from './mensaje.js';
import { OtBreve } from './ot.js';
import { TareaSalida } from './tarea.js';

export const TicketBase = z.object({
  asunto: texto(200),
  descripcion: texto(20_000).nullable(),
  cliente_id: id.nullable(),
  solicitante_nombre: texto(120).nullable(),
  solicitante_correo: correo.nullable(),
  origen: z.enum(ORIGENES_TICKET),
  prioridad: z.enum(PRIORIDADES),
  categoria_id: id.nullable(),
  inicio_planificado: instante.nullable(),
  fecha_limite: instante.nullable(),
  horas_estimadas: z.number().min(0).max(9999).multipleOf(0.25).nullable(),
});

type Fechas = {
  inicio_planificado?: string | null | undefined;
  fecha_limite?: string | null | undefined;
};
const limiteDespuesDeInicio = (v: Fechas): boolean =>
  !v.fecha_limite ||
  !v.inicio_planificado ||
  new Date(v.fecha_limite).getTime() > new Date(v.inicio_planificado).getTime();
const MENSAJE_FECHAS = {
  message: 'fecha_limite debe ser posterior a inicio_planificado',
  path: ['fecha_limite'],
};

export const TicketCrearEntrada = TicketBase.extend({
  responsable_principal_id: id.nullable().default(null),
  responsables_ids: z.array(id).max(10).default([]),
  seguidores_ids: z.array(id).max(20).default([]),
  archivo_ids: z.array(id).max(10).default([]), // pendientes propios (fotos/documentos del ticket)
  correo: z
    .union([
      z.object({
        archivo_id: id,
        adjuntos_indices: z.array(z.number().int().min(0)).max(10).default([]),
      }),
      z.object({ texto: z.string().trim().min(1).max(200_000) }),
    ])
    .nullable()
    .default(null),
})
  .refine(limiteDespuesDeInicio, MENSAJE_FECHAS)
  .refine(
    (v) =>
      new Set(v.responsables_ids).size === v.responsables_ids.length &&
      (v.responsable_principal_id === null ||
        !v.responsables_ids.includes(v.responsable_principal_id)),
    {
      message: 'responsables_ids no puede repetir ni incluir al responsable principal',
      path: ['responsables_ids'],
    },
  );

// PATCH: todo opcional; misma regla de fechas si vienen ambas
export const TicketEditarEntrada = TicketBase.partial().refine(
  limiteDespuesDeInicio,
  MENSAJE_FECHAS,
);

// Reemplaza el conjunto; si principal_id es null, otros_ids debe ser []
export const ResponsablesEntrada = z
  .object({ principal_id: id.nullable(), otros_ids: z.array(id).max(10) })
  .refine((v) => v.principal_id !== null || v.otros_ids.length === 0, {
    message: 'otros_ids debe ser vacío si no hay responsable principal',
    path: ['otros_ids'],
  });

export const SeguidoresEntrada = z.object({ usuario_ids: z.array(id).max(20) });

export const TicketResumen = z.object({
  id,
  numero: z.number(),
  codigo: z.string(),
  asunto: z.string(),
  cliente: ClienteBreve.nullable(),
  estado: z.enum(ESTADOS_TICKET),
  espera_de: z.enum(ESPERA_DE).nullable(),
  espera_detalle: z.string().nullable(),
  prioridad: z.enum(PRIORIDADES),
  responsables: z.array(Responsable), // principal primero
  fecha_limite: instante.nullable(),
  inicio_planificado: instante.nullable(),
  vencido: z.boolean(),
  vence_hoy: z.boolean(),
  tiene_correo: z.boolean(),
  n_mensajes: z.number(), // B11
  motivo_cierre: z.string().nullable(),
  duplicado_de: z.object({ id, codigo: z.string() }).nullable(),
  tipo: z.enum(TIPOS_TICKET),
  ot_vinculada: z
    .object({ id, codigo: z.string(), tipo: z.enum(['facturable', 'interna']) })
    .nullable(),
  creado_en: instante,
  actualizado_en: instante,
  cerrado_en: instante.nullable(),
  archivado_en: instante.nullable(),
});

export const TicketSalida = TicketResumen.extend(TicketBase.shape).extend({
  categoria: referencia.nullable(),
  seguidores: z.array(UsuarioBreve),
  respuesta_limite: instante.nullable(),
  primera_respuesta_en: instante.nullable(),
  correo: CorreoAdjuntoSalida.nullable(),
  archivos: z.array(ArchivoSalida), // del ticket, sin los de mensajes ni el correo
  tareas: z.array(TareaSalida),
  creado_por: referencia.nullable(),
  ots: z.array(OtBreve), // más nueva primero
});

export const TicketsQuery = esquemaPaginacion.extend({
  q: texto(80).optional(),
  estado: csv(ESTADOS_TICKET).optional(),
  prioridad: csv(PRIORIDADES).optional(),
  responsable_id: idQuery.optional(),
  solo_mios: booleanoTexto.optional(),
  sin_asignar: booleanoTexto.optional(),
  cliente_id: idQuery.optional(),
  categoria_id: idQuery.optional(),
  archivados: booleanoTexto.default('false'),
  vencen_hoy: booleanoTexto.optional(),
  vencidos: booleanoTexto.optional(),
  con_ot: booleanoTexto.optional(),
  tipo: csv(TIPOS_TICKET).optional(),
  orden: z
    .enum(['-actualizado_en', '-creado_en', 'fecha_limite', 'prioridad'])
    .default('-actualizado_en'),
});

export const TableroQuery = TicketsQuery.omit({
  pagina: true,
  por_pagina: true,
  estado: true,
  archivados: true,
  orden: true,
});

export const EventoTicketSalida = z.object({
  id: z.number(),
  creado_en: instante,
  autor: referencia.nullable(),
  accion: z.string(),
  campo: z.string().nullable(),
  valor_anterior: z.string().nullable(),
  valor_nuevo: z.string().nullable(),
  datos: z.record(z.string(), z.unknown()).nullable(),
});

export const ActividadQuery = z.object({
  tipo: z.enum(['todo', 'seguimiento', 'nota_interna', 'historial']).default('todo'),
});

export const ActividadItem = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('mensaje'), creado_en: instante, mensaje: MensajeSalida }),
  z.object({ tipo: z.literal('evento'), creado_en: instante, evento: EventoTicketSalida }),
]);

export const ActividadSalida = z.object({
  items: z.array(ActividadItem),
  conteos: z.object({
    todo: z.number(),
    seguimiento: z.number(),
    nota_interna: z.number(),
    historial: z.number(),
  }),
});
