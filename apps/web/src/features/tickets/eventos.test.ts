import { describe, expect, it } from 'vitest';
import { describirEvento, type EventoDatos } from './eventos';

const evento = (cambios: Partial<EventoDatos>): EventoDatos => ({
  id: 1,
  creado_en: '2026-09-28T19:58:00.000Z',
  autor: { id: 2, nombre: 'Camila Rojas' },
  accion: 'cambio',
  campo: null,
  valor_anterior: null,
  valor_nuevo: null,
  datos: null,
  ...cambios,
});

describe('describirEvento', () => {
  it('creado', () => {
    expect(
      describirEvento(evento({ accion: 'creado', datos: { desde_correo: false } })).texto,
    ).toBe('creó el ticket');
  });

  it('creado desde un correo', () => {
    expect(describirEvento(evento({ accion: 'creado', datos: { desde_correo: true } })).texto).toBe(
      'creó el ticket desde un correo adjunto',
    );
  });

  it('cambio de estado con chip', () => {
    expect(
      describirEvento(
        evento({ campo: 'estado', valor_anterior: 'Nuevo', valor_nuevo: 'En curso' }),
      ),
    ).toEqual({ texto: 'cambió el estado', cambio: 'Nuevo → En curso' });
  });

  it('en espera muestra de quién se espera', () => {
    const d = describirEvento(
      evento({
        campo: 'estado',
        valor_anterior: 'En curso',
        valor_nuevo: 'En espera',
        datos: { espera_de: 'repuesto' },
      }),
    );
    expect(d.cambio).toBe('En curso → En espera · repuesto');
  });

  it('descartado lleva el motivo en una segunda línea', () => {
    const d = describirEvento(
      evento({
        campo: 'estado',
        valor_anterior: 'Nuevo',
        valor_nuevo: 'Descartado',
        datos: { motivo: 'No corresponde' },
      }),
    );
    expect(d.detalle).toBe('No corresponde');
  });

  it('cambio de responsables y valores vacíos', () => {
    expect(
      describirEvento(
        evento({ campo: 'responsables', valor_anterior: null, valor_nuevo: 'Camila Rojas' }),
      ),
    ).toEqual({ texto: 'cambió los responsables', cambio: '— → Camila Rojas' });
  });

  it('eventos de tareas', () => {
    const d = (accion: string) =>
      describirEvento(evento({ accion, datos: { titulo: 'Cargar CAF' } })).texto;
    expect(d('tarea_creada')).toBe('agregó la tarea «Cargar CAF»');
    expect(d('tarea_hecha')).toBe('marcó hecha la tarea «Cargar CAF»');
    expect(d('tarea_reabierta')).toBe('reabrió la tarea «Cargar CAF»');
    expect(d('tarea_quitada')).toBe('quitó la tarea «Cargar CAF»');
    expect(d('tarea_editada')).toBe('editó la tarea «Cargar CAF»');
  });

  it('archivado por el sistema', () => {
    expect(describirEvento(evento({ accion: 'archivado', autor: null })).texto).toBe(
      'El sistema archivó el ticket',
    );
  });
  it('convertido_en_ot con chip y origen', () => {
    expect(
      describirEvento(
        evento({
          accion: 'convertido_en_ot',
          valor_nuevo: 'OT-0218 · Facturable',
          datos: { ot_id: 5, codigo: 'OT-0218', desde_ot: { id: 4, codigo: 'OT-0217' } },
        }),
      ),
    ).toEqual({
      texto: 'convirtió el ticket en',
      cambio: 'OT-0218 · Facturable',
      detalle: 'A partir de OT-0217',
    });
  });

  it('ot_cerrada indica si resolvió y recorta el resumen', () => {
    const d = describirEvento(
      evento({
        accion: 'ot_cerrada',
        datos: { codigo: 'OT-0218', resolvio_ticket: false, resumen: 'x'.repeat(200) },
      }),
    );
    expect(d.texto).toBe('cerró');
    expect(d.cambio).toBe('OT-0218 · no resolvió el ticket');
    expect(d.detalle).toHaveLength(120);
    expect(
      describirEvento(
        evento({ accion: 'ot_cerrada', datos: { codigo: 'OT-0218', resolvio_ticket: true } }),
      ).cambio,
    ).toBe('OT-0218 · resolvió el ticket');
  });

  it('ot_cancelada muestra el motivo', () => {
    expect(
      describirEvento(
        evento({
          accion: 'ot_cancelada',
          datos: { codigo: 'OT-0218', motivo: 'Cliente desistió' },
        }),
      ),
    ).toEqual({ texto: 'canceló OT-0218', detalle: 'Cliente desistió' });
  });

  it('seguimiento_copiado', () => {
    expect(
      describirEvento(evento({ accion: 'seguimiento_copiado', datos: { codigo: 'OT-0218' } }))
        .texto,
    ).toBe('copió un seguimiento desde OT-0218');
  });
});
