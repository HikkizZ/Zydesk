import { DataSource } from 'typeorm';
import { env } from '../config/env.js';

export class ErrorBdTest extends Error {}

export interface ConexionAdmin {
  usuario: string | undefined;
  contrasena: string | undefined;
  puerto: string | undefined;
}

const SUFIJO_VALIDO = /^[a-z0-9_]{1,20}$/;

function urlAdmin(
  c: { usuario: string; contrasena: string; puerto: string },
  base: string,
): string {
  const u = encodeURIComponent;
  return `postgres://${u(c.usuario)}:${u(c.contrasena)}@localhost:${c.puerto}/${base}`;
}

// Conexión puntual como superusuario de desarrollo (sin entidades ni migraciones).
async function conCliente<T>(url: string, fn: (ds: DataSource) => Promise<T>): Promise<T> {
  const ds = new DataSource({ type: 'postgres', url });
  await ds.initialize();
  try {
    return await fn(ds);
  } finally {
    await ds.destroy();
  }
}

// Crea `zydesk_test_<sufijo>` con los mismos roles y permisos que `zydesk_test` (docker/postgres-init/01-roles.sql).
// Idempotente: si la base ya existe, solo repite los permisos. Las migraciones las aplica `prepararBd()` en los tests.
export async function crearBdTest(
  sufijo: string,
  conexion: ConexionAdmin = {
    usuario: env.POSTGRES_USER,
    contrasena: env.POSTGRES_PASSWORD,
    puerto: env.POSTGRES_PORT,
  },
  entorno: string = env.NODE_ENV,
): Promise<string> {
  if (entorno === 'production') throw new ErrorBdTest('bd-test no está permitido en producción');
  if (!SUFIJO_VALIDO.test(sufijo)) {
    throw new ErrorBdTest('Sufijo inválido: usa de 1 a 20 caracteres [a-z0-9_]');
  }
  const { usuario, contrasena, puerto } = conexion;
  if (!usuario || !contrasena || !puerto) {
    throw new ErrorBdTest('Faltan POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_PORT');
  }
  const datos = { usuario, contrasena, puerto };
  const nombre = `zydesk_test_${sufijo}`;

  await conCliente(urlAdmin(datos, 'postgres'), async (c) => {
    const existe: unknown[] = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      nombre,
    ]);
    if (existe.length === 0) await c.query(`CREATE DATABASE "${nombre}" OWNER zydesk_owner`);
    await c.query(`GRANT CREATE ON DATABASE "${nombre}" TO zydesk_app`);
  });

  await conCliente(urlAdmin(datos, nombre), async (c) => {
    await c.query('ALTER SCHEMA public OWNER TO zydesk_owner');
    await c.query('GRANT USAGE ON SCHEMA public TO zydesk_app');
    await c.query(
      'ALTER DEFAULT PRIVILEGES FOR ROLE zydesk_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zydesk_app',
    );
    await c.query(
      'ALTER DEFAULT PRIVILEGES FOR ROLE zydesk_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO zydesk_app',
    );
  });
  return nombre;
}
