import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { entidades } from '../database/entidades.js';
import { env } from './env.js';
import { logger } from './logger.js';

const urlApp = env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL! : env.DATABASE_URL;

export const dataSource = new DataSource({
  type: 'postgres',
  url: urlApp,
  entities: entidades,
  migrations: [],
  synchronize: false,
  logging: false,
});

export async function comprobarBd(): Promise<boolean> {
  try {
    await dataSource.query('SELECT 1');
    return true;
  } catch (err) {
    logger.warn({ err }, 'base de datos no responde');
    return false;
  }
}
