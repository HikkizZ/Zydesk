import { describe, expect, it } from 'vitest';
import {
  esHoraExtendida,
  horasHabilesEntre,
  sumarDiasHabiles,
  sumarHorasHabiles,
  sumarPlazo,
} from './motor.js';
import { SOPORTE, L, dia } from './fixtures.test.js';
import type { Calendario } from './tipos.js';

const iso = (d: Date) => d.toISOString();

describe('sumarHorasHabiles', () => {
  const casos: Array<[number, string, Date, number, Date]> = [
    [1, 'dentro del bloque', L(2026, 9, 29, 9, 0), 2, L(2026, 9, 29, 11, 0)],
    [2, 'cruza colación', L(2026, 9, 29, 12, 0), 2, L(2026, 9, 29, 15, 0)],
    [3, 'cruza día', L(2026, 9, 29, 16, 0), 4, L(2026, 9, 30, 10, 30)],
    [4, 'viernes corto + fin de semana', L(2026, 10, 2, 15, 0), 3, L(2026, 10, 5, 10, 0)],
    [5, 'feriado 18-sep y fin de semana', L(2026, 9, 17, 17, 0), 2, L(2026, 9, 21, 9, 30)],
    [6, 'inicio sábado', L(2026, 10, 3, 10, 0), 1, L(2026, 10, 5, 9, 30)],
    [7, 'inicio antes de entrada', L(2026, 9, 29, 7, 0), 1, L(2026, 9, 29, 9, 30)],
    [8, 'inicio en colación', L(2026, 9, 29, 13, 30), 1, L(2026, 9, 29, 15, 0)],
    [9, 'inicio después de salida', L(2026, 9, 29, 19, 0), 1, L(2026, 9, 30, 9, 30)],
    [10, 'fracción', L(2026, 9, 29, 12, 45), 0.5, L(2026, 9, 29, 14, 15)],
    [11, 'cero horas fuera de jornada', L(2026, 10, 3, 10, 0), 0, L(2026, 10, 5, 8, 30)],
    [12, 'jornada exacta', L(2026, 9, 28, 8, 30), 8.5, L(2026, 9, 28, 18, 0)],
    [13, 'semana completa', L(2026, 9, 28, 8, 30), 41, L(2026, 10, 2, 16, 30)],
    [14, 'cambio a horario de invierno', L(2026, 4, 2, 16, 0), 4, L(2026, 4, 6, 10, 30)],
    [15, 'cambio a horario de verano', L(2026, 9, 4, 15, 0), 4, L(2026, 9, 7, 11, 0)],
  ];

  it.each(casos)('%i: %s', (_n, _desc, desde, horas, esperado) => {
    expect(iso(sumarHorasHabiles(desde, horas, SOPORTE))).toBe(iso(esperado));
  });

  it('14: cambio de hora afirmado en UTC', () => {
    expect(iso(L(2026, 4, 2, 16, 0))).toBe('2026-04-02T19:00:00.000Z');
    expect(iso(sumarHorasHabiles(L(2026, 4, 2, 16, 0), 4, SOPORTE))).toBe(
      '2026-04-06T14:30:00.000Z',
    );
  });

  it('15: cambio de hora afirmado en UTC', () => {
    expect(iso(L(2026, 9, 4, 15, 0))).toBe('2026-09-04T19:00:00.000Z');
    expect(iso(sumarHorasHabiles(L(2026, 9, 4, 15, 0), 4, SOPORTE))).toBe(
      '2026-09-07T14:00:00.000Z',
    );
  });

  it('28: colacion_min = 0 es un solo bloque', () => {
    const cal: Calendario = {
      horario: [0, 1, 2, 3, 4, 5, 6].map((d) =>
        dia(d, d >= 1 && d <= 5, '09:00', '17:00', '13:00', 0),
      ),
      feriados: [],
    };
    expect(iso(sumarHorasHabiles(L(2026, 9, 28, 12, 30), 1, cal))).toBe(
      iso(L(2026, 9, 28, 13, 30)),
    );
  });

  it('29: calendario sin días activos lanza', () => {
    const cal: Calendario = {
      horario: [0, 1, 2, 3, 4, 5, 6].map((d) => dia(d, false, '09:00', '17:00', '13:00', 60)),
      feriados: [],
    };
    expect(() => sumarHorasHabiles(L(2026, 9, 28, 10, 0), 1, cal)).toThrow(
      'Calendario sin días hábiles',
    );
    expect(() => sumarDiasHabiles(L(2026, 9, 28, 10, 0), 1, cal)).toThrow(
      'Calendario sin días hábiles',
    );
  });
});

describe('sumarDiasHabiles', () => {
  const casos: Array<[number, string, Date, number, Date]> = [
    [16, 'simple', L(2026, 9, 29, 10, 0), 1, L(2026, 9, 30, 10, 0)],
    [17, 'con feriado', L(2026, 9, 17, 10, 0), 1, L(2026, 9, 21, 10, 0)],
    [18, 'hora recortada', L(2026, 10, 1, 17, 30), 1, L(2026, 10, 2, 16, 30)],
    [19, 'desde fin de semana', L(2026, 10, 3, 10, 0), 2, L(2026, 10, 6, 10, 0)],
    [20, '3 días con año nuevo feriado', L(2026, 12, 30, 9, 0), 3, L(2027, 1, 5, 9, 0)],
  ];

  it.each(casos)('%i: %s', (_n, _desc, desde, dias, esperado) => {
    expect(iso(sumarDiasHabiles(desde, dias, SOPORTE))).toBe(iso(esperado));
  });
});

describe('sumarPlazo', () => {
  it('despacha por unidad', () => {
    expect(iso(sumarPlazo(L(2026, 9, 29, 9, 0), { valor: 2, unidad: 'horas' }, SOPORTE))).toBe(
      iso(L(2026, 9, 29, 11, 0)),
    );
    expect(iso(sumarPlazo(L(2026, 9, 29, 10, 0), { valor: 1, unidad: 'dias' }, SOPORTE))).toBe(
      iso(L(2026, 9, 30, 10, 0)),
    );
  });
});

describe('horasHabilesEntre', () => {
  it('21: martes 09:00 a miércoles 10:30', () => {
    expect(horasHabilesEntre(L(2026, 9, 29, 9, 0), L(2026, 9, 30, 10, 30), SOPORTE)).toBe(10);
  });
  it('22: fin de semana entero', () => {
    expect(horasHabilesEntre(L(2026, 10, 3, 0, 0), L(2026, 10, 5, 0, 0), SOPORTE)).toBe(0);
  });
  it('23: invertido es negativo', () => {
    expect(horasHabilesEntre(L(2026, 9, 30, 10, 30), L(2026, 9, 29, 9, 0), SOPORTE)).toBe(-10);
  });
  it('24: con cambio de hora', () => {
    expect(horasHabilesEntre(L(2026, 4, 2, 16, 0), L(2026, 4, 6, 10, 30), SOPORTE)).toBe(4);
  });
});

describe('esHoraExtendida', () => {
  it.each([
    ['mar 19:30', L(2026, 9, 29, 19, 30), true],
    ['mar 18:30 (fuera de bloque)', L(2026, 9, 29, 18, 30), true],
    ['mar 17:59', L(2026, 9, 29, 17, 59), false],
    ['mar 13:15 (colación)', L(2026, 9, 29, 13, 15), true],
    ['sáb 10:00', L(2026, 10, 3, 10, 0), true],
  ] as const)('25: %s', (_d, fecha, esperado) => {
    expect(esHoraExtendida(fecha, SOPORTE)).toBe(esperado);
  });
});
