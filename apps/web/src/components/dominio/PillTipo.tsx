import { Pill } from '@/components/dominio/Pill';

export type TipoTicket = 'ticket' | 'ot_facturable' | 'ot_interna';

// En la Fase 2 siempre es "Ticket"; la Fase 3 rellena los tipos de OT.
export function PillTipo({ tipo = 'ticket' }: { tipo?: TipoTicket }) {
  if (tipo === 'ot_facturable') return <Pill tono="resuelto">OT facturable</Pill>;
  if (tipo === 'ot_interna') return <Pill tono="interna">OT interna</Pill>;
  return <Pill tono="neutro">Ticket</Pill>;
}
