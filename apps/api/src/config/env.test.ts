import { describe, expect, it } from 'vitest';
import { cargarEnv } from './env.js';

const URL_BD = 'postgres://u:p@localhost:5432/d';

describe('cargarEnv', () => {
  it('lanza si falta DATABASE_URL y el mensaje la menciona', () => {
    expect(() => cargarEnv({})).toThrow(/DATABASE_URL/);
  });

  it('convierte API_PUERTO a número', () => {
    expect(cargarEnv({ DATABASE_URL: URL_BD, API_PUERTO: '4000' }).API_PUERTO).toBe(4000);
  });

  it('trata LOG_LEVEL vacío como ausente', () => {
    expect(cargarEnv({ DATABASE_URL: URL_BD, LOG_LEVEL: '' }).LOG_LEVEL).toBeUndefined();
  });
});
