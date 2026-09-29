import { describe, expect, it } from 'vitest';
import { formatearFecha } from './fecha.js';

describe('formatearFecha', () => {
  it('formatea ISO en zona Santiago', () => {
    expect(formatearFecha('2026-09-29T15:00:00Z')).toBe('29 sep 2026');
  });
  it('usa el día local de Santiago (UTC-3)', () => {
    expect(formatearFecha('2026-01-01T02:30:00Z')).toBe('31 dic 2025');
  });
  it('acepta Date', () => {
    expect(formatearFecha(new Date(Date.UTC(2026, 5, 15, 12)))).toBe('15 jun 2026');
  });
});
