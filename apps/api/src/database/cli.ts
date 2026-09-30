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

try {
  await programa.parseAsync(process.argv);
  process.exit(0);
} catch (err) {
  logger.error({ err }, 'comando fallido');
  process.exit(1);
}
