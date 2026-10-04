import type { EntityManager } from 'typeorm';
import { ErrorApp } from '../../core/errores/error-app.js';
import { hoyEnSantiago } from '../../core/fechas.js';

export const errorValidacion = (errores: Record<string, string[]>): ErrorApp =>
  new ErrorApp('VALIDACION', 'Datos inválidos', errores);

export { hoyEnSantiago };

export const recortar = (s: string, n = 120): string => (s.length > n ? `${s.slice(0, n)}…` : s);

// Nombre de la persona; `null` si el id es null. No comprueba que esté activa.
export async function nombreUsuario(tx: EntityManager, id: number | null): Promise<string | null> {
  if (id === null) return null;
  const [u]: { nombre: string }[] = await tx.query(`SELECT nombre FROM usuario WHERE id = $1`, [
    id,
  ]);
  return u?.nombre ?? null;
}

// Contrato de bolsa vigente hoy (Santiago) del cliente, o null.
export async function bolsaVigente(tx: EntityManager, cliente_id: number): Promise<number | null> {
  const [b]: { id: number }[] = await tx.query(
    `SELECT id FROM contrato_bolsa
      WHERE cliente_id = $1 AND vigente_desde <= $2::date
        AND (vigente_hasta IS NULL OR vigente_hasta >= $2::date)
      ORDER BY vigente_desde DESC, id DESC LIMIT 1`,
    [cliente_id, hoyEnSantiago()],
  );
  return b?.id ?? null;
}
