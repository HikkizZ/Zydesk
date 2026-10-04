import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOT_API_KEY_EJEMPLO, cargarEnv } from './env.js';

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

describe('cargarEnv (Fase 2)', () => {
  const base = {
    NODE_ENV: 'test',
    DATABASE_URL: URL_BD,
    TEST_DATABASE_URL: 'postgres://a:b@localhost:5433/zydesk_test',
    TEST_DATABASE_URL_OWNER: 'postgres://c:d@localhost:5433/zydesk_test',
  };

  it('TEST_BD_SUFIJO reescribe la base de TEST_DATABASE_URL y su variante owner', () => {
    const e = cargarEnv({ ...base, TEST_BD_SUFIJO: '2d' });
    expect(e.TEST_DATABASE_URL).toMatch(/\/zydesk_test_2d$/);
    expect(e.TEST_DATABASE_URL_OWNER).toMatch(/\/zydesk_test_2d$/);
    expect(e.TEST_DATABASE_URL).toContain('a:b@localhost:5433');
  });

  it('sin sufijo (o vacío) no cambia las URLs', () => {
    expect(cargarEnv(base).TEST_DATABASE_URL).toBe(base.TEST_DATABASE_URL);
    expect(cargarEnv({ ...base, TEST_BD_SUFIJO: '' }).TEST_DATABASE_URL).toBe(
      base.TEST_DATABASE_URL,
    );
  });

  it('el sufijo no afecta fuera de NODE_ENV=test', () => {
    const e = cargarEnv({ ...base, NODE_ENV: 'development', TEST_BD_SUFIJO: '2d' });
    expect(e.TEST_DATABASE_URL).toBe(base.TEST_DATABASE_URL);
  });

  it('sufijo inválido lanza', () => {
    expect(() => cargarEnv({ ...base, TEST_BD_SUFIJO: '2D!' })).toThrow(/TEST_BD_SUFIJO/);
  });

  it('ARCHIVOS_DIR tiene valor por defecto y se resuelve a ruta absoluta', () => {
    const e = cargarEnv({ DATABASE_URL: URL_BD });
    expect(path.isAbsolute(e.ARCHIVOS_DIR)).toBe(true);
    expect(e.ARCHIVOS_DIR.replaceAll('\\', '/')).toMatch(/\/datos\/archivos$/);
  });
});

describe('cargarEnv (Fase 6: Telegram)', () => {
  const base = { DATABASE_URL: URL_BD };
  const clave32 = 'k'.repeat(32);

  it('sin variables de Telegram: token y clave ausentes, WEB_URL por defecto y sin barra final', () => {
    const e = cargarEnv(base);
    expect(e.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(e.BOT_API_KEY).toBeUndefined();
    expect(e.WEB_URL).toBe('http://localhost:5173');
    expect(cargarEnv({ ...base, WEB_URL: 'https://desk.zytech.dev/' }).WEB_URL).toBe(
      'https://desk.zytech.dev',
    );
  });

  it('WEB_URL solo http(s): javascript: y otros esquemas se rechazan (prueba 17)', () => {
    for (const malo of ['javascript:alert(1)', 'ftp://desk.zytech.dev', 'desk.zytech.dev']) {
      expect(() => cargarEnv({ ...base, WEB_URL: malo }), malo).toThrow(/WEB_URL/);
    }
  });

  it('con TELEGRAM_BOT_TOKEN exige BOT_API_KEY', () => {
    expect(() => cargarEnv({ ...base, TELEGRAM_BOT_TOKEN: 'x' })).toThrow(/BOT_API_KEY/);
    expect(
      cargarEnv({ ...base, TELEGRAM_BOT_TOKEN: 'x', BOT_API_KEY: 'clave-corta' }).BOT_API_KEY,
    ).toBe('clave-corta');
  });

  it('en producción con token: BOT_API_KEY de 32+ caracteres y distinta de la del ejemplo, y WEB_URL https', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      TELEGRAM_BOT_TOKEN: 'x',
      BOT_API_KEY: clave32,
      WEB_URL: 'https://desk.zytech.dev',
    };
    expect(cargarEnv(prod).BOT_API_KEY).toBe(clave32);
    expect(() => cargarEnv({ ...prod, BOT_API_KEY: 'corta' })).toThrow(/BOT_API_KEY/);
    expect(() => cargarEnv({ ...prod, BOT_API_KEY: BOT_API_KEY_EJEMPLO })).toThrow(/BOT_API_KEY/);
    expect(() => cargarEnv({ ...prod, WEB_URL: 'http://desk.zytech.dev' })).toThrow(/WEB_URL/);
    expect(() => cargarEnv({ ...prod, WEB_URL: '' })).toThrow(/WEB_URL/);
  });

  it('TELEGRAM_BOT_USUARIO: sin @, solo caracteres de usuario; vacío es ausente', () => {
    expect(cargarEnv({ ...base, TELEGRAM_BOT_USUARIO: '@zydesk_bot' }).TELEGRAM_BOT_USUARIO).toBe(
      'zydesk_bot',
    );
    expect(cargarEnv({ ...base, TELEGRAM_BOT_USUARIO: '' }).TELEGRAM_BOT_USUARIO).toBeUndefined();
    expect(() => cargarEnv({ ...base, TELEGRAM_BOT_USUARIO: 'a b/c' })).toThrow(
      /TELEGRAM_BOT_USUARIO/,
    );
  });
});
