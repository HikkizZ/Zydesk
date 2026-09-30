import { fuenteNumerosFase1, leerContador, type FuenteNumeros } from './numeracion.js';

// Fase 2 (spec §5.7): los tickets se cuentan sobre la tabla real; las OT siguen con la fuente de la
// Fase 1 hasta que exista la tabla `ot` (Fase 3).
export const fuenteNumeros: FuenteNumeros = {
  async ultimoUsado(tx, clave) {
    if (clave === 'ot') return fuenteNumerosFase1.ultimoUsado(tx, clave);
    const [f]: { ultimo: number | null }[] = await tx.query(
      `SELECT max(numero)::int AS ultimo FROM ticket`,
    );
    return f?.ultimo ?? null;
  },
  async usados(tx, clave) {
    if (clave === 'ot') return fuenteNumerosFase1.usados(tx, clave);
    const c = await leerContador(tx, clave);
    const [f]: { n: number }[] = await tx.query(
      `SELECT count(*)::int AS n FROM ticket WHERE numero >= $1`,
      [c.inicial],
    );
    return f?.n ?? 0;
  },
  async existe(tx, clave, numero) {
    if (clave === 'ot') return false;
    const filas: unknown[] = await tx.query(`SELECT 1 FROM ticket WHERE numero = $1`, [numero]);
    return filas.length > 0;
  },
};
