import { describe, expect, it } from 'vitest';
import { diasHabilesEntre, jornadaDiariaPromedio } from './dias-habiles.js';
import { L, SOPORTE, dia } from './fixtures.test.js';
import type { Calendario, HorarioDia } from './tipos.js';

const CAL: Calendario = { ...SOPORTE, feriados: ['2026-10-12'] };

describe('diasHabilesEntre', () => {
  it.each([
    ['dos días a la misma hora', L(2026, 9, 28, 10, 0), L(2026, 9, 30, 10, 0), 2],
    ['jornada completa', L(2026, 9, 28, 8, 30), L(2026, 9, 28, 18, 0), 1],
    ['jueves y viernes completos', L(2026, 10, 1, 8, 30), L(2026, 10, 2, 16, 30), 2],
    ['media jornada de viernes', L(2026, 10, 2, 8, 30), L(2026, 10, 2, 12, 0), 0.5],
    ['fuera de jornada', L(2026, 9, 28, 20, 0), L(2026, 9, 29, 20, 0), 1],
    ['fin de semana', L(2026, 10, 3, 10, 0), L(2026, 10, 4, 10, 0), 0],
    ['cruce de feriado', L(2026, 10, 9, 10, 0), L(2026, 10, 13, 10, 0), 0.96],
    ['orden invertido', L(2026, 9, 30, 10, 0), L(2026, 9, 28, 10, 0), 0],
  ])('%s', (_caso, a, b, esperado) => {
    expect(diasHabilesEntre(a, b, CAL)).toBe(esperado);
  });
});

describe('jornadaDiariaPromedio', () => {
  const semana = (activos: [number, string, string, number][]): HorarioDia[] =>
    [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const a = activos.find(([n]) => n === d);
      return a
        ? dia(d, true, a[1], a[2], '13:00', a[3])
        : dia(d, false, '09:00', '13:00', '13:00', 0);
    });

  it.each([
    ['Soporte TI', SOPORTE.horario, 8.2],
    [
      'Terreno (8 h x 5)',
      semana(
        [1, 2, 3, 4, 5].map((n) => [n, '09:00', '17:00', 0] as [number, string, string, number]),
      ),
      8,
    ],
    [
      'Coordinación (8 x 4 + 7)',
      semana([
        [1, '09:00', '17:00', 0],
        [2, '09:00', '17:00', 0],
        [3, '09:00', '17:00', 0],
        [4, '09:00', '17:00', 0],
        [5, '09:00', '16:00', 0],
      ]),
      7.8,
    ],
    ['todo inactivo', semana([]), 0],
  ])('%s', (_caso, horario, esperado) => {
    expect(jornadaDiariaPromedio(horario)).toBe(esperado);
  });
});
