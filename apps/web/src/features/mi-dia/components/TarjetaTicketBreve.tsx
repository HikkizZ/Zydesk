import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { Codigo } from '@/components/dominio/Codigo';
import { FranjaPlazo } from '@/components/dominio/FranjaPlazo';
import { PillPrioridad } from '@/components/dominio/PillPrioridad';
import type { TicketResumenDatos } from '@/features/tickets/api';

// Ticket en una lista de Mi día: fila con borde inferior; toda la fila enlaza al detalle (ADR 0022).
// `pie` reemplaza a la franja de plazo.
export function TarjetaTicketBreve({
  ticket,
  pie,
}: {
  ticket: TicketResumenDatos;
  pie?: React.ReactNode;
}) {
  return (
    <article
      aria-label={`${ticket.codigo} ${ticket.asunto}`}
      className="relative flex min-h-12 flex-col gap-1 border-b border-linea py-3 transition-colors last:border-b-0 hover:bg-lienzo"
    >
      <div className="flex items-center gap-2">
        <Codigo>{ticket.codigo}</Codigo>
        <span className="min-w-0 truncate text-xs text-tinta-3">
          {ticket.cliente?.nombre ?? 'Sin cliente'}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <PillPrioridad prioridad={ticket.prioridad} />
          <ChevronRight aria-hidden="true" className="size-[13px] text-tinta-4" />
        </span>
      </div>
      <Link
        to={`/tickets/${ticket.id}`}
        data-objetivo="cubre-tarjeta"
        className="line-clamp-2 text-tabla font-medium text-tinta after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50 lg:line-clamp-1"
      >
        {ticket.asunto}
      </Link>
      <div className="text-xs text-tinta-2">{pie ?? <FranjaPlazo ticket={ticket} />}</div>
    </article>
  );
}
