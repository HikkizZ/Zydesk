import { describe, expect, it } from 'vitest';
import { dataSource } from '../../config/db.js';
import { dataSourceOwner } from '../../database/data-source-owner.js';
import { ErrorApp } from '../errores/error-app.js';
import { comprobarLimites, registrarFallo } from './limites.js';

async function conOwner(sql: string): Promise<void> {
  await dataSourceOwner.initialize();
  try {
    await dataSourceOwner.query(sql);
  } finally {
    await dataSourceOwner.destroy();
  }
}

const contar = async (accion: string, correo: string): Promise<number> => {
  const [r] = await dataSource.query(
    `SELECT count(*)::int AS n FROM auditoria WHERE accion = $1 AND detalle->>'correo' = $2`,
    [accion, correo],
  );
  return r.n;
};

async function capturar(fn: () => Promise<void>): Promise<ErrorApp | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    if (err instanceof ErrorApp) return err;
    throw err;
  }
}

const minutosHasta = (iso: string): number => (new Date(iso).getTime() - Date.now()) / 60_000;

describe('limites: por cuenta', () => {
  it('4 fallos no bloquean; el 5.º inserta cuenta_bloqueada y bloquea', async () => {
    for (let i = 0; i < 4; i++) await registrarFallo('a@x.cl', 'ua');
    await comprobarLimites('a@x.cl', '10.0.0.1');
    expect(await contar('cuenta_bloqueada', 'a@x.cl')).toBe(0);
    await registrarFallo('a@x.cl', 'ua');
    expect(await contar('ingreso_fallido', 'a@x.cl')).toBe(5);
    expect(await contar('cuenta_bloqueada', 'a@x.cl')).toBe(1);
    const err = await capturar(() => comprobarLimites('a@x.cl', '10.0.0.1'));
    expect(err?.codigo).toBe('INGRESO_BLOQUEADO');
    const minutos = minutosHasta((err!.detalles as { reintentar_en: string }).reintentar_en);
    expect(minutos).toBeGreaterThan(14);
    expect(minutos).toBeLessThanOrEqual(15);
  });

  it('no afecta a otros correos', async () => {
    for (let i = 0; i < 5; i++) await registrarFallo('a@x.cl', null);
    await comprobarLimites('b@x.cl', '10.0.0.1');
  });

  it('el segundo bloqueo dura 30 minutos', async () => {
    // un bloqueo previo ya vencido cuenta para bloqueo_n; hay 4 fallos → el siguiente es el 5.º
    await conOwner(`INSERT INTO auditoria (accion, detalle, creado_en) VALUES
      ('cuenta_bloqueada', jsonb_build_object('correo','a@x.cl','bloqueo_n',1,'hasta',(now() - interval '1 minute')::text), now() - interval '20 minutes'),
      ('ingreso_fallido', '{"correo":"a@x.cl"}', now() - interval '19 minutes'),
      ('ingreso_fallido', '{"correo":"a@x.cl"}', now() - interval '18 minutes'),
      ('ingreso_fallido', '{"correo":"a@x.cl"}', now() - interval '17 minutes'),
      ('ingreso_fallido', '{"correo":"a@x.cl"}', now() - interval '16 minutes')`);
    await registrarFallo('a@x.cl', null);
    const [b] = await dataSource.query(
      `SELECT detalle FROM auditoria WHERE accion = 'cuenta_bloqueada' ORDER BY id DESC LIMIT 1`,
    );
    expect(b.detalle.bloqueo_n).toBe(2);
    const minutos = minutosHasta(b.detalle.hasta);
    expect(minutos).toBeGreaterThan(29);
    expect(minutos).toBeLessThanOrEqual(30);
  });

  it('un ingreso_ok posterior reinicia la cuenta', async () => {
    for (let i = 0; i < 5; i++) await registrarFallo('a@x.cl', null);
    await conOwner(
      `INSERT INTO auditoria (accion, detalle) VALUES ('ingreso_ok', '{"correo":"a@x.cl"}')`,
    );
    await comprobarLimites('a@x.cl', '10.0.0.1');
  });
});

describe('limites: por IP', () => {
  it('20 intentos en 15 min desde la misma IP bloquean a cualquier correo', async () => {
    await conOwner(`INSERT INTO auditoria (accion, ip, detalle, creado_en)
      SELECT 'ingreso_fallido', '10.0.0.9', jsonb_build_object('correo', 'x' || g || '@x.cl'), now() - interval '10 minutes'
        FROM generate_series(1, 20) g`);
    const err = await capturar(() => comprobarLimites('nuevo@x.cl', '10.0.0.9'));
    expect(err?.codigo).toBe('INGRESO_BLOQUEADO');
    const minutos = minutosHasta((err!.detalles as { reintentar_en: string }).reintentar_en);
    expect(minutos).toBeGreaterThan(4);
    expect(minutos).toBeLessThanOrEqual(5);
    await comprobarLimites('nuevo@x.cl', '10.0.0.10');
  });

  it('19 intentos, o 30 fuera de la ventana, no bloquean', async () => {
    await conOwner(`INSERT INTO auditoria (accion, ip, detalle, creado_en)
      SELECT 'ingreso_ok', '10.0.0.9', '{}', now() - interval '1 minute' FROM generate_series(1, 19)`);
    await conOwner(`INSERT INTO auditoria (accion, ip, detalle, creado_en)
      SELECT 'ingreso_ok', '10.0.0.8', '{}', now() - interval '16 minutes' FROM generate_series(1, 30)`);
    await comprobarLimites('a@x.cl', '10.0.0.9');
    await comprobarLimites('a@x.cl', '10.0.0.8');
  });
});
