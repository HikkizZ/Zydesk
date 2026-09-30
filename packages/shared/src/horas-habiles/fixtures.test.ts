import { TZDate } from '@date-fns/tz';
import { ZONA } from '../formato/fecha.js';
import type { Calendario, HorarioDia } from './tipos.js';

export function dia(
  dia_semana: number,
  activo: boolean,
  entrada: string,
  salida: string,
  colacion_inicio: string,
  colacion_min: number,
): HorarioDia {
  return { dia_semana, activo, entrada, salida, colacion_inicio, colacion_min };
}

/** Fecha local de Santiago (mes 1-12). */
export function L(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(new TZDate(y, m - 1, d, h, min, ZONA).getTime());
}

export const SOPORTE: Calendario = {
  horario: [
    dia(0, false, '09:00', '13:00', '13:00', 0),
    dia(1, true, '08:30', '18:00', '13:00', 60),
    dia(2, true, '08:30', '18:00', '13:00', 60),
    dia(3, true, '08:30', '18:00', '13:00', 60),
    dia(4, true, '08:30', '18:00', '13:00', 60),
    dia(5, true, '08:30', '16:30', '13:00', 60),
    dia(6, false, '09:00', '13:00', '13:00', 0),
  ],
  hora_extendida_desde: '19:00',
  feriados: ['2026-04-03', '2026-09-18', '2026-09-19', '2027-01-01'],
};

import { describe, expect, it } from 'vitest';

describe('fixtures', () => {
  it('SOPORTE tiene 7 días de horario', () => {
    expect(SOPORTE.horario).toHaveLength(7);
  });
});
