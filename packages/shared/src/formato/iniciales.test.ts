import { describe, expect, it } from 'vitest';
import { iniciales } from './iniciales.js';

describe('iniciales', () => {
  it.each([
    ['Sebastián Díaz', 'SD'],
    ['Hikki', 'HI'],
    ['  ana   maría  pérez ', 'AP'],
    ['x', 'X'],
    ['', ''],
  ])('%s -> %s', (nombre, esperado) => {
    expect(iniciales(nombre)).toBe(esperado);
  });
});
