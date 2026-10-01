import { describe, expect, it } from 'vitest';
import { HorasQuery, RegistroHorasEditar, RegistroHorasEntrada } from './horas.js';

describe('RegistroHorasEntrada', () => {
  const base = { fecha: '2026-09-28', horas: 1 };

  it('acepta una fila de OT con tarea y una "Sin ticket"', () => {
    expect(
      RegistroHorasEntrada.safeParse({ ...base, ot_id: 3, tarea_id: 5, horas: 1.5 }).success,
    ).toBe(true);
    expect(RegistroHorasEntrada.safeParse({ ...base, descripcion: 'Reunión' }).success).toBe(true);
  });

  it('rechaza ticket y OT a la vez', () => {
    expect(RegistroHorasEntrada.safeParse({ ...base, ticket_id: 1, ot_id: 2 }).success).toBe(false);
  });

  it('rechaza tarea sin OT', () => {
    expect(RegistroHorasEntrada.safeParse({ ...base, ticket_id: 1, tarea_id: 2 }).success).toBe(
      false,
    );
  });

  it('rechaza "Sin ticket" sin descripción', () => {
    expect(RegistroHorasEntrada.safeParse(base).success).toBe(false);
  });

  it.each([0, 0.1, 24.25, 25])('rechaza horas = %s', (horas) => {
    expect(RegistroHorasEntrada.safeParse({ ...base, ot_id: 1, horas }).success).toBe(false);
  });

  it.each([0.25, 24])('acepta horas = %s', (horas) => {
    expect(RegistroHorasEntrada.safeParse({ ...base, ot_id: 1, horas }).success).toBe(true);
  });
});

describe('RegistroHorasEditar', () => {
  it('rechaza {} y {ot_id} (clave desconocida: queda vacío)', () => {
    expect(RegistroHorasEditar.safeParse({}).success).toBe(false);
    expect(RegistroHorasEditar.safeParse({ ot_id: 3 }).success).toBe(false);
  });

  it('acepta un cambio parcial', () => {
    expect(RegistroHorasEditar.safeParse({ horas: 2.5 }).success).toBe(true);
  });
});

describe('HorasQuery', () => {
  it('acepta semana=2026-10-01', () => {
    expect(HorasQuery.parse({ semana: '2026-10-01' }).semana).toBe('2026-10-01');
  });
});
