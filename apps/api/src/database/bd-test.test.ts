import { DataSource } from 'typeorm';
import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { crearBdTest, ErrorBdTest } from './bd-test.js';

// con el pid para que bloques en paralelo no se pisen
const SUFIJO = `prueba_bd_${process.pid}`;
const NOMBRE = `zydesk_test_${SUFIJO}`;
const admin = {
  usuario: env.POSTGRES_USER,
  contrasena: env.POSTGRES_PASSWORD,
  puerto: env.POSTGRES_PORT,
};

async function conAdmin<T>(base: string, fn: (c: DataSource) => Promise<T>): Promise<T> {
  const c = new DataSource({
    type: 'postgres',
    url: `postgres://${admin.usuario}:${encodeURIComponent(admin.contrasena!)}@localhost:${admin.puerto}/${base}`,
  });
  await c.initialize();
  try {
    return await fn(c);
  } finally {
    await c.destroy();
  }
}

describe('bd-test crear', () => {
  // DROP DATABASE fuerza un checkpoint: con la base cargada por el resto de la suite puede tardar
  afterAll(async () => {
    await conAdmin('postgres', (c) => c.query(`DROP DATABASE IF EXISTS "${NOMBRE}"`));
  }, 60_000);

  it('rechaza sufijos inválidos, producción y conexión incompleta', async () => {
    await expect(crearBdTest('2D!', admin, 'test')).rejects.toThrow(ErrorBdTest);
    await expect(crearBdTest('2d', admin, 'production')).rejects.toThrow(/producción/);
    await expect(
      crearBdTest('2d', { usuario: undefined, contrasena: 'x', puerto: '5433' }, 'test'),
    ).rejects.toThrow('Faltan POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_PORT');
  });

  it('crea la base con roles y permisos, y es idempotente', async () => {
    expect(await crearBdTest(SUFIJO, admin, 'test')).toBe(NOMBRE);
    // segunda vez: no falla
    expect(await crearBdTest(SUFIJO, admin, 'test')).toBe(NOMBRE);

    const filas = await conAdmin('postgres', (c) =>
      c.query(`SELECT pg_get_userbyid(datdba) AS dueno FROM pg_database WHERE datname = $1`, [
        NOMBRE,
      ]),
    );
    expect(filas[0]?.dueno).toBe('zydesk_owner');

    const esquema = await conAdmin(NOMBRE, (c) =>
      c.query(
        `SELECT pg_get_userbyid(nspowner) AS dueno FROM pg_namespace WHERE nspname = 'public'`,
      ),
    );
    expect(esquema[0]?.dueno).toBe('zydesk_owner');
  }, 60_000);
});
