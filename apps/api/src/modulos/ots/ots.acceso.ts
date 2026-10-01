import type { EtapaOt, TipoOt } from '@zydesk/shared';
import { esEtapaFinal } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { ErrorApp } from '../../core/errores/error-app.js';

export interface OtBloqueada {
  id: number;
  codigo: string;
  ticket_id: number;
  tipo: TipoOt;
  etapa: EtapaOt;
  cliente_id: number | null;
  final: boolean; // etapa cerrada o cancelada
}

// Orden de bloqueo (spec fase 3 §1.2): si la transacción también toca el ticket, `bloquearTicket` va antes.
export async function bloquearOt(tx: EntityManager, id: number): Promise<OtBloqueada> {
  const [fila]: Omit<OtBloqueada, 'final'>[] = await tx.query(
    `SELECT id, codigo, ticket_id, tipo, etapa, cliente_id FROM ot WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!fila) throw new ErrorApp('NO_ENCONTRADO', 'OT no encontrada');
  return { ...fila, final: esEtapaFinal(fila.etapa) };
}

export const otCerrada = (): ErrorApp =>
  new ErrorApp('OT_CERRADA', 'La OT está cerrada o cancelada');

export async function registrarActividadEnOt(tx: EntityManager, id: number): Promise<void> {
  await tx.query(`UPDATE ot SET actualizado_en = now() WHERE id = $1`, [id]);
}

export async function existeOt(m: EntityManager, id: number): Promise<boolean> {
  const filas: unknown[] = await m.query(`SELECT 1 FROM ot WHERE id = $1`, [id]);
  return filas.length > 0;
}
