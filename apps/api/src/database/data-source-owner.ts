import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { entidades } from './entidades.js';
import { env } from '../config/env.js';

const raiz = fileURLToPath(new URL('.', import.meta.url)).replaceAll('\\', '/');

const url = env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL_OWNER : env.DATABASE_URL_OWNER;
if (!url) {
  throw new Error(
    `Configuración inválida: ${env.NODE_ENV === 'test' ? 'TEST_DATABASE_URL_OWNER' : 'DATABASE_URL_OWNER'} no definida`,
  );
}

// Solo este DataSource ejecuta migraciones (rol zydesk_owner, ADR 0017).
export const dataSourceOwner = new DataSource({
  type: 'postgres',
  url,
  entities: entidades,
  migrations: [`${raiz}migraciones/*.{ts,js}`],
  migrationsTableName: 'migracion',
  synchronize: false,
  logging: false,
});
