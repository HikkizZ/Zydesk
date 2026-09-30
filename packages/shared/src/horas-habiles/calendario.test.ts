import { describe, expect, it } from 'vitest';
import { bloquesDelDia, jornadaSemanalHoras } from './calendario.js';
import { SOPORTE, L, dia } from './fixtures.test.js';
import type { HorarioDia } from './tipos.js';

describe('calendario', () => {
  it('26: jornada semanal de SOPORTE = 41', () => {
    expect(jornadaSemanalHoras(SOPORTE.horario)).toBe(41);
  });

  it('27: bloquesDelDia de un feriado es []', () => {
    expect(bloquesDelDia(L(2026, 9, 18, 10, 0), SOPORTE)).toEqual([]);
  });

  it('bloquesDelDia de un martes: dos bloques alrededor de la colación', () => {
    const b = bloquesDelDia(L(2026, 9, 29, 10, 0), SOPORTE);
    expect(b.map((x) => [x.inicio.toISOString(), x.fin.toISOString()])).toEqual([
      [L(2026, 9, 29, 8, 30).toISOString(), L(2026, 9, 29, 13, 0).toISOString()],
      [L(2026, 9, 29, 14, 0).toISOString(), L(2026, 9, 29, 18, 0).toISOString()],
    ]);
  });

  it('bloquesDelDia de un sábado inactivo es []', () => {
    expect(bloquesDelDia(L(2026, 10, 3, 10, 0), SOPORTE)).toEqual([]);
  });

  it('30: Terreno (L-V 08:00-17:00, colación 60) = 40', () => {
    const horario: HorarioDia[] = [0, 1, 2, 3, 4, 5, 6].map((d) =>
      dia(d, d >= 1 && d <= 5, '08:00', '17:00', '13:00', 60),
    );
    expect(jornadaSemanalHoras(horario)).toBe(40);
  });
});
