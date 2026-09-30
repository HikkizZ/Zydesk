import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';

// Aislamiento por defecto (READ COMMITTED).
export function enTransaccion<T>(fn: (tx: EntityManager) => Promise<T>): Promise<T> {
  return dataSource.transaction(fn);
}
