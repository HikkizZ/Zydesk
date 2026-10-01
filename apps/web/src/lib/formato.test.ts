import { expect, it } from 'vitest';
import { formatearHoras, horasCorto } from './formato';

it('formatearHoras usa coma decimal y sufijo " h"', () => {
  expect(formatearHoras(3.5)).toBe('3,5 h');
  expect(formatearHoras(0)).toBe('0 h');
  expect(formatearHoras(8.25)).toBe('8,25 h');
});

it('horasCorto no lleva sufijo y queda vacío si es 0', () => {
  expect(horasCorto(3.5)).toBe('3,5');
  expect(horasCorto(12)).toBe('12');
  expect(horasCorto(0)).toBe('');
});
