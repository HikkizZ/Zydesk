import 'reflect-metadata';
import { Command } from 'commander';
import { logger } from '../config/logger.js';

const programa = new Command('zydesk-db');

async function conOwner<T>(
  fn: (ds: typeof import('./data-source-owner.js').dataSourceOwner) => Promise<T>,
) {
  const { dataSourceOwner } = await import('./data-source-owner.js');
  await dataSourceOwner.initialize();
  try {
    return await fn(dataSourceOwner);
  } finally {
    await dataSourceOwner.destroy();
  }
}

programa
  .command('migrar')
  .description('Aplica las migraciones pendientes (rol owner)')
  .action(async () => {
    await conOwner(async (ds) => {
      const aplicadas = await ds.runMigrations();
      for (const m of aplicadas) logger.info({ migracion: m.name }, 'migración aplicada');
      logger.info({ total: aplicadas.length }, 'migraciones aplicadas');
    });
  });

programa
  .command('revertir')
  .description('Revierte la última migración (o todas con --todo)')
  .option('--todo', 'revierte todas las migraciones')
  .action(async (opciones: { todo?: boolean }) => {
    await conOwner(async (ds) => {
      const veces = opciones.todo ? ds.migrations.length : 1;
      for (let i = 0; i < veces; i++) await ds.undoLastMigration();
      logger.info('migraciones revertidas');
    });
  });

programa
  .command('admin')
  .description('Crea el primer usuario Administración (lee ADMIN_PASSWORD)')
  .requiredOption('--correo <correo>', 'correo del administrador')
  .requiredOption('--nombre <nombre>', 'nombre del administrador')
  .action(async (opciones: { correo: string; nombre: string }) => {
    const { crearAdmin, conDataSource, ErrorCli } = await import('./admin.js');
    const { env } = await import('../config/env.js');
    try {
      const id = await conDataSource(() =>
        crearAdmin({ ...opciones, contrasena: env.ADMIN_PASSWORD }),
      );
      logger.info({ usuario_id: id }, 'administrador creado');
    } catch (err) {
      if (!(err instanceof ErrorCli)) throw err;
      logger.error(err.message);
      process.exit(1);
    }
  });

programa
  .command('openapi')
  .description('Escribe docs/api/openapi.json (construye la app sin conectar a la BD)')
  .action(async () => {
    const { escribirOpenApi } = await import('./openapi.js');
    logger.info({ archivo: await escribirOpenApi() }, 'openapi.json generado');
  });

try {
  await programa.parseAsync(process.argv);
  process.exit(0);
} catch (err) {
  logger.error({ err }, 'comando fallido');
  process.exit(1);
}
