import 'reflect-metadata';
import { dataSource } from '../src/config/db.js';
import { sembrarBase } from '../src/database/semillas/base.js';

// Las migraciones (y el TRUNCATE) usan el DataSource owner; se importa perezosamente.
export async function prepararBd(): Promise<void> {
  const { dataSourceOwner } = await import('../src/database/data-source-owner.js');
  await dataSourceOwner.initialize();
  try {
    await dataSourceOwner.runMigrations();
  } finally {
    await dataSourceOwner.destroy();
  }
  await dataSource.initialize();
}

// TRUNCATE con el owner: la app no puede borrar `evento` ni `auditoria`.
export async function reiniciarBd(): Promise<void> {
  const { dataSourceOwner } = await import('../src/database/data-source-owner.js');
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
  await sembrarBase(dataSource.manager);
}

export async function cerrarBd(): Promise<void> {
  if (dataSource.isInitialized) await dataSource.destroy();
}
