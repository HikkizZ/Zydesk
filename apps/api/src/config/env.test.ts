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

describe('cargarEnv (Fase 1)', () => {
  it('con NODE_ENV=test exige TEST_DATABASE_URL', () => {
    expect(() => cargarEnv({ NODE_ENV: 'test', DATABASE_URL: URL_BD })).toThrow(
      /TEST_DATABASE_URL/,
    );
    expect(
      cargarEnv({ NODE_ENV: 'test', DATABASE_URL: URL_BD, TEST_DATABASE_URL: URL_BD })
        .TEST_DATABASE_URL,
    ).toBe(URL_BD);
  });

  it('EJECUTAR_JOBS vacío o ausente es true; "false" es false', () => {
    expect(cargarEnv({ DATABASE_URL: URL_BD, EJECUTAR_JOBS: '' }).EJECUTAR_JOBS).toBe(true);
    expect(cargarEnv({ DATABASE_URL: URL_BD }).EJECUTAR_JOBS).toBe(true);
    expect(cargarEnv({ DATABASE_URL: URL_BD, EJECUTAR_JOBS: 'false' }).EJECUTAR_JOBS).toBe(false);
  });

  it('PROXY_SALTOS por defecto 0 y contraseñas vacías son undefined', () => {
    const e = cargarEnv({
      DATABASE_URL: URL_BD,
      PROXY_SALTOS: '',
      ADMIN_PASSWORD: '',
      SEMILLA_PASSWORD: '',
    });
    expect(e.PROXY_SALTOS).toBe(0);
    expect(e.ADMIN_PASSWORD).toBeUndefined();
    expect(e.SEMILLA_PASSWORD).toBeUndefined();
    expect(cargarEnv({ DATABASE_URL: URL_BD, PROXY_SALTOS: '2' }).PROXY_SALTOS).toBe(2);
  });
});
