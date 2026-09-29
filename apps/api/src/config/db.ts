import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from './env.js';
import { logger } from './logger.js';

export const dataSource = new DataSource({
  type: 'postgres',
  url: env.DATABASE_URL,
  entities: [],
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
