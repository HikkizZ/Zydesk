import { dataSource } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { cargarLegal } from '../../modulos/legal/legal.service.js';
import { conDataSource } from '../admin.js';
import { sembrarBase } from './base.js';
import { sembrarDesarrollo } from './desarrollo.js';

// `db:sembrar`: semilla base + datos de desarrollo, idempotente. Sale con 1 si falta SEMILLA_PASSWORD.
export async function sembrarTodo(): Promise<void> {
  try {
    cargarLegal();
    await conDataSource(async () => {
      await sembrarBase(dataSource.manager);
      await sembrarDesarrollo(env.SEMILLA_PASSWORD);
    });
    logger.info('semillas de desarrollo aplicadas');
  } catch (err) {
    logger.error({ err }, 'no se pudieron aplicar las semillas');
    process.exit(1);
  }
}

// `db:reiniciar`: TRUNCATE de todas las tablas (salvo `migracion`) con el owner y vuelve a sembrar.
export async function reiniciarDesarrollo(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    logger.error('db:reiniciar no está permitido en producción');
    process.exit(1);
  }
  const { dataSourceOwner } = await import('../data-source-owner.js');
  await dataSourceOwner.initialize();
  try {
    const tablas: { tablename: string }[] = await dataSourceOwner.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migracion'`,
    );
    if (tablas.length > 0) {
      const lista = tablas.map((t) => `"${t.tablename}"`).join(', ');
      await dataSourceOwner.query(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await dataSourceOwner.destroy();
  }
  await sembrarTodo();
}
