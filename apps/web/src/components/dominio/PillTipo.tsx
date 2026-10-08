import { Chip } from '@/components/dominio/Chip';

export type TipoTicket = 'ticket' | 'ot_facturable' | 'ot_interna';

// Con `codigo` (la OT vinculada) dice "OT-0218 · Facturable"; sin él, el tipo a secas.
export function PillTipo({ tipo = 'ticket', codigo }: { tipo?: TipoTicket; codigo?: string }) {
  if (tipo === 'ot_facturable') {
    return <Chip tono="acento">{codigo ? `${codigo} · Facturable` : 'OT facturable'}</Chip>;
  }
  if (tipo === 'ot_interna') {
    return (
      <Chip tono="interna" punto>
        {codigo ? `${codigo} · Interna` : 'OT interna'}
      </Chip>
    );
  }
  return <Chip>Ticket</Chip>;
}
