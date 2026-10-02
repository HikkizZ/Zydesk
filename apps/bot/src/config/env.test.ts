import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { advertenciaApiUrl, cargarEnv } from './env.js';

const clave = randomBytes(32).toString('base64');
const base = {
  NODE_ENV: 'test',
  TELEGRAM_BOT_TOKEN: '1:token-de-prueba',
  BOT_API_KEY: 'clave-compartida-16+',
  BOT_CLAVE_CIFRADO: clave,
};

describe('env del bot', () => {
  it('sin token queda deshabilitado aunque falte el resto', () => {
    expect(cargarEnv({ NODE_ENV: 'test' }).habilitado).toBe(false);
    expect(cargarEnv({ NODE_ENV: 'test', TELEGRAM_BOT_TOKEN: '' }).habilitado).toBe(false);
  });

  it('con token acepta la configuración completa y aplica valores por defecto', () => {
    const e = cargarEnv(base);
    expect(e.habilitado).toBe(true);
    if (!e.habilitado) return;
    expect(e.BOT_CLAVE_CIFRADO).toHaveLength(32);
    expect(e.API_URL).toBe('http://localhost:3010');
    expect(e.BOT_DATOS_DIR.replace(/\\/g, '/')).toMatch(/datos\/bot$/);
  });

  it('rechaza BOT_CLAVE_CIFRADO que no sea de 32 bytes', () => {
    const corta = randomBytes(16).toString('base64');
    expect(() => cargarEnv({ ...base, BOT_CLAVE_CIFRADO: corta })).toThrow(/BOT_CLAVE_CIFRADO/);
    expect(() => cargarEnv({ ...base, BOT_CLAVE_CIFRADO: 'no-es-base64!!' })).toThrow(
      /BOT_CLAVE_CIFRADO/,
    );
  });

  it('con token exige BOT_API_KEY (mín. 16) y BOT_CLAVE_CIFRADO', () => {
    expect(() => cargarEnv({ ...base, BOT_API_KEY: undefined })).toThrow(/BOT_API_KEY/);
    expect(() => cargarEnv({ ...base, BOT_API_KEY: 'corta' })).toThrow(/BOT_API_KEY/);
    expect(() => cargarEnv({ ...base, BOT_CLAVE_CIFRADO: undefined })).toThrow(/BOT_CLAVE_CIFRADO/);
  });

  it('en producción exige API_URL', () => {
    expect(() => cargarEnv({ ...base, NODE_ENV: 'production' })).toThrow(/API_URL/);
  });

  it('API_URL inválida falla', () => {
    expect(() => cargarEnv({ ...base, API_URL: 'no-es-url' })).toThrow(/API_URL/);
  });
});

describe('advertenciaApiUrl', () => {
  it.each([
    ['http://api:3000', false],
    ['http://localhost:3010', false],
    ['https://interna.example.com', false],
    ['http://otro-host:3000', true],
    ['https://desk.zytech.dev', true],
  ])('%s', (url, avisa) => {
    expect(advertenciaApiUrl(url) !== null).toBe(avisa);
  });
});
