import type { EntityManager } from 'typeorm';

// Punto de escritura de `mensaje.horas` para otros módulos (horas: ADR 0025.20). Sin dependencias hacia `horas`.
// El destino del mensaje y la fila de horas ya están bloqueados por el llamador.
export async function fijarHorasDeMensaje(
  tx: EntityManager,
  mensaje_id: number,
  horas: number | null,
): Promise<void> {
  await tx.query(`UPDATE mensaje SET horas = $2 WHERE id = $1`, [mensaje_id, horas]);
}
