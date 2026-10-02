import { expect, it } from 'vitest';
import { formatearFechaLarga } from './fechas';

it('formatearFechaLarga escribe día de la semana, día y mes en español', () => {
  expect(formatearFechaLarga('2026-10-01')).toBe('jueves 1 de octubre');
  expect(formatearFechaLarga('2026-12-31')).toBe('jueves 31 de diciembre');
});
