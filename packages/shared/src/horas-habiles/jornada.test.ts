import { describe, expect, it } from 'vitest';
import { SOPORTE, dia } from './fixtures.test.js';
import { diasDeSemana, horasJornada, lunesDe } from './jornada.js';
import type { Calendario, HorarioDia } from './tipos.js';

const CAL: Calendario = { ...SOPORTE, feriados: ['2026-10-12'] };

const SIN_COLACION: Calendario = {
  horario: [0, 1, 2, 3, 4, 5, 6].map((d): HorarioDia =>
    dia(d, d >= 1 && d <= 5, '09:00', '17:00', '13:00', 0),
  ),
  feriados: [],
};

describe('horasJornada', () => {
  it.each([
    ['día normal', '2026-09-28', CAL, 8.5],
    ['viernes corto', '2026-10-02', CAL, 7],
    ['sábado inactivo', '2026-10-03', CAL, 0],
    ['feriado', '2026-10-12', CAL, 0],
    ['sin colación', '2026-09-28', SIN_COLACION, 8],
  ])('%s', (_caso, fecha, cal, esperado) => {
    expect(horasJornada(fecha, cal)).toBe(esperado);
  });
});

describe('lunesDe', () => {
  it.each([
    ['2026-10-01', '2026-09-28'],
    ['2026-09-28', '2026-09-28'],
    ['2026-10-04', '2026-09-28'],
    ['2027-01-01', '2026-12-28'],
  ])('%s -> %s', (fecha, lunes) => {
    expect(lunesDe(fecha)).toBe(lunes);
  });
});

describe('diasDeSemana', () => {
  it('devuelve 7 fechas de lunes a domingo', () => {
    const dias = diasDeSemana('2026-09-28');
    expect(dias).toHaveLength(7);
    expect(dias[0]).toBe('2026-09-28');
    expect(dias[6]).toBe('2026-10-04');
  });

  it('cruza el fin de año', () => {
    expect(diasDeSemana('2026-12-28')[6]).toBe('2027-01-03');
  });
});
