import { cerrarBd, prepararBd } from './bd.js';

export async function setup(): Promise<void> {
  await prepararBd();
}

export async function teardown(): Promise<void> {
  await cerrarBd();
}
