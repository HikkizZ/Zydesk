import { leerContador, type ClaveContador, type FuenteNumeros } from './numeracion.js';

// Los tickets y las OT se cuentan sobre sus tablas reales (Fase 2 y Fase 3).
const TABLAS: Record<ClaveContador, string> = { ticket: 'ticket', ot: 'ot' };

export const fuenteNumeros: FuenteNumeros = {
  async ultimoUsado(tx, clave) {
    const [f]: { ultimo: number | null }[] = await tx.query(
      `SELECT max(numero)::int AS ultimo FROM ${TABLAS[clave]}`,
    );
    return f?.ultimo ?? null;
  },
  async usados(tx, clave) {
    const c = await leerContador(tx, clave);
    const [f]: { n: number }[] = await tx.query(
      `SELECT count(*)::int AS n FROM ${TABLAS[clave]} WHERE numero >= $1`,
      [c.inicial],
    );
    return f?.n ?? 0;
  },
  async existe(tx, clave, numero) {
    const filas: unknown[] = await tx.query(`SELECT 1 FROM ${TABLAS[clave]} WHERE numero = $1`, [
      numero,
    ]);
    return filas.length > 0;
  },
};
