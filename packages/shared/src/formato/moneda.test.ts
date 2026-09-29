import { describe, expect, it } from 'vitest';
import { formatearCLP } from './moneda.js';

describe('formatearCLP', () => {
  it.each([
    [565250, '$565.250'],
    [0, '$0'],
    [1000, '$1.000'],
    [-4500, '-$4.500'],
    [1234.6, '$1.235'],
  ])('%s -> %s', (monto, esperado) => {
    expect(formatearCLP(monto)).toBe(esperado);
  });
});
