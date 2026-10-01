import { Pill } from '@/components/dominio/Pill';

export type TipoTicket = 'ticket' | 'ot_facturable' | 'ot_interna';

// Con `codigo` (la OT vinculada) dice "OT-0218 · Facturable"; sin él, el tipo a secas.
export function PillTipo({ tipo = 'ticket', codigo }: { tipo?: TipoTicket; codigo?: string }) {
  if (tipo === 'ot_facturable') {
    return <Pill tono="resuelto">{codigo ? `${codigo} · Facturable` : 'OT facturable'}</Pill>;
  }
  if (tipo === 'ot_interna') {
    return <Pill tono="interna">{codigo ? `${codigo} · Interna` : 'OT interna'}</Pill>;
  }
  return <Pill tono="neutro">Ticket</Pill>;
}
