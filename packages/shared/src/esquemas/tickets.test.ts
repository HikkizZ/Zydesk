import { describe, expect, it } from 'vitest';
import { ESTADOS_TICKET } from '../enums/ticket.js';
import { csv } from './comunes.js';
import { MensajeEntrada } from './mensaje.js';
import {
  ResponsablesEntrada,
  TableroQuery,
  TicketCrearEntrada,
  TicketEditarEntrada,
  TicketsQuery,
} from './ticket.js';

describe('csv', () => {
  const esquema = csv(ESTADOS_TICKET);
  it('separa por comas y valida cada valor', () => {
    expect(esquema.parse('nuevo,en_curso')).toEqual(['nuevo', 'en_curso']);
    expect(esquema.parse('resuelto')).toEqual(['resuelto']);
  });
  it('rechaza valores desconocidos y lista vacía', () => {
    expect(esquema.safeParse('nuevo,otro').success).toBe(false);
    expect(esquema.safeParse('').success).toBe(false);
  });
});

describe('esquemas de tickets (Fase 2)', () => {
  const base = {
    asunto: 'Error al emitir facturas',
    descripcion: null,
    cliente_id: null,
    solicitante_nombre: null,
    solicitante_correo: null,
    origen: 'externo',
    prioridad: 'media',
    categoria_id: null,
    inicio_planificado: null,
    fecha_limite: null,
    horas_estimadas: null,
  };

  it('TicketCrearEntrada aplica valores por defecto', () => {
    const r = TicketCrearEntrada.parse(base);
    expect(r.responsables_ids).toEqual([]);
    expect(r.seguidores_ids).toEqual([]);
    expect(r.archivo_ids).toEqual([]);
    expect(r.correo).toBeNull();
    expect(r.responsable_principal_id).toBeNull();
  });

  it('TicketCrearEntrada rechaza fecha_limite anterior o igual a inicio_planificado', () => {
    const inicio = '2026-10-05T09:00:00Z';
    const con = (fecha_limite: string) =>
      TicketCrearEntrada.safeParse({ ...base, inicio_planificado: inicio, fecha_limite }).success;
    expect(con('2026-10-04T09:00:00Z')).toBe(false);
    expect(con(inicio)).toBe(false);
    expect(con('2026-10-06T09:00:00Z')).toBe(true);
    expect(
      TicketCrearEntrada.safeParse({ ...base, fecha_limite: '2026-10-06T09:00:00Z' }).success,
    ).toBe(true);
  });

  it('TicketCrearEntrada: responsables sin repetidos ni el principal; horas múltiplo de 0.25', () => {
    expect(
      TicketCrearEntrada.safeParse({ ...base, responsable_principal_id: 1, responsables_ids: [1] })
        .success,
    ).toBe(false);
    expect(TicketCrearEntrada.safeParse({ ...base, responsables_ids: [2, 2] }).success).toBe(false);
    expect(
      TicketCrearEntrada.safeParse({
        ...base,
        responsable_principal_id: 1,
        responsables_ids: [2, 3],
      }).success,
    ).toBe(true);
    expect(TicketCrearEntrada.safeParse({ ...base, horas_estimadas: 1.3 }).success).toBe(false);
    expect(TicketCrearEntrada.safeParse({ ...base, horas_estimadas: 1.25 }).success).toBe(true);
  });

  it('TicketCrearEntrada acepta correo por archivo o por texto', () => {
    expect(TicketCrearEntrada.parse({ ...base, correo: { archivo_id: 3 } }).correo).toEqual({
      archivo_id: 3,
      adjuntos_indices: [],
    });
    expect(TicketCrearEntrada.parse({ ...base, correo: { texto: ' De: a ' } }).correo).toEqual({
      texto: 'De: a',
    });
    expect(TicketCrearEntrada.safeParse({ ...base, correo: {} }).success).toBe(false);
  });

  it('TicketEditarEntrada es parcial y valida las fechas si vienen ambas', () => {
    expect(TicketEditarEntrada.safeParse({}).success).toBe(true);
    expect(TicketEditarEntrada.safeParse({ asunto: 'Nuevo' }).success).toBe(true);
    expect(
      TicketEditarEntrada.safeParse({
        inicio_planificado: '2026-10-05T09:00:00Z',
        fecha_limite: '2026-10-01T09:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('ResponsablesEntrada: sin principal no hay otros', () => {
    expect(ResponsablesEntrada.safeParse({ principal_id: null, otros_ids: [2] }).success).toBe(
      false,
    );
    expect(ResponsablesEntrada.safeParse({ principal_id: null, otros_ids: [] }).success).toBe(true);
    expect(ResponsablesEntrada.safeParse({ principal_id: 1, otros_ids: [2] }).success).toBe(true);
  });

  it('TicketsQuery: defectos, csv y coerción; TableroQuery omite paginación y estado', () => {
    const q = TicketsQuery.parse({ estado: 'nuevo,en_curso', responsable_id: '4' });
    expect(q).toMatchObject({
      estado: ['nuevo', 'en_curso'],
      responsable_id: 4,
      archivados: 'false',
      orden: '-actualizado_en',
      pagina: 1,
      por_pagina: 50,
    });
    expect(TicketsQuery.safeParse({ estado: 'x' }).success).toBe(false);
    expect(TableroQuery.parse({ solo_mios: 'true' })).toEqual({ solo_mios: 'true' });
  });

  it('MensajeEntrada: horas múltiplo de 0.25 entre 0.25 y 24', () => {
    const m = { tipo: 'seguimiento', texto: 'Listo' };
    expect(MensajeEntrada.parse(m).horas).toBeNull();
    expect(MensajeEntrada.safeParse({ ...m, horas: 1.5 }).success).toBe(true);
    expect(MensajeEntrada.safeParse({ ...m, horas: 0 }).success).toBe(false);
    expect(MensajeEntrada.safeParse({ ...m, horas: 0.3 }).success).toBe(false);
    expect(MensajeEntrada.safeParse({ ...m, tipo: 'otro' }).success).toBe(false);
  });
});
