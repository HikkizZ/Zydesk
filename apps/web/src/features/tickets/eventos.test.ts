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
});
