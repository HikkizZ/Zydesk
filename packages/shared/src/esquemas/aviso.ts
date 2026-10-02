import { z } from 'zod';
import { EVENTOS_AVISO, FILTROS_AVISO, TIPOS_AVISO } from '../enums/aviso.js';
import { UsuarioBreve, booleanoTexto, esquemaPaginacion, id, instante } from './comunes.js';

export const AvisoSalida = z.object({
  id: z.number(),
  evento: z.enum(EVENTOS_AVISO),
  tipo: z.enum(TIPOS_AVISO),
  texto: z.string(),
  enlace: z.string(),
  entidad: z.enum(['ticket', 'ot']),
  entidad_id: id,
  datos: z.record(z.string(), z.unknown()),
  actor: UsuarioBreve.nullable(),
  leido: z.boolean(),
  leido_en: instante.nullable(),
  creado_en: instante,
  telegram: z.enum(['enviado', 'pendiente', 'fallido', 'omitido']).nullable(), // null si no se encoló
});

export const AvisosQuery = esquemaPaginacion.extend({
  filtro: z.enum(FILTROS_AVISO).default('todos'),
  solo_no_leidos: booleanoTexto.optional(),
});

export const AvisosSalida = z.object({
  datos: z.array(AvisoSalida),
  total: z.number(),
  pagina: z.number(),
  por_pagina: z.number(),
  no_leidos: z.number(),
});

export const NoLeidosSalida = z.object({ no_leidos: z.number() });
export const LeerTodosSalida = z.object({ marcados: z.number() });

export const PreferenciaFila = z.object({
  evento: z.enum(EVENTOS_AVISO),
  app: z.boolean(),
  telegram: z.boolean(),
});

export const PreferenciasSalida = z.object({
  filas: z.array(PreferenciaFila).length(EVENTOS_AVISO.length),
  telegram_vinculado: z.boolean(),
});

// Parcial: solo las filas que cambian
export const PreferenciasEntrada = z
  .object({ filas: z.array(PreferenciaFila).min(1).max(EVENTOS_AVISO.length) })
  .refine((v) => new Set(v.filas.map((f) => f.evento)).size === v.filas.length, {
    path: ['filas'],
    message: 'Hay eventos repetidos',
  })
  .refine((v) => v.filas.every((f) => f.evento !== 'resumen_diario' || f.app === false), {
    path: ['filas'],
    message: 'El resumen diario solo va por Telegram',
  });
