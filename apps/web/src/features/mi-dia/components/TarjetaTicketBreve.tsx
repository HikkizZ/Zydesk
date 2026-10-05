import { Link } from 'react-router';
import { Codigo } from '@/components/dominio/Codigo';
import { FechaLimite } from '@/components/dominio/FechaLimite';
import { PillEstado } from '@/components/dominio/PillEstado';
import { PillPrioridad } from '@/components/dominio/PillPrioridad';
import type { TicketResumenDatos } from '@/features/tickets/api';

// Ticket en una lista de Mi día; toda la tarjeta enlaza al detalle (ADR 0022). `pie` reemplaza a la fecha límite.
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
      className="relative flex min-h-11 flex-col gap-1.5 rounded-lg border border-borde bg-superficie p-3 transition-colors hover:bg-superficie-suave"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Codigo>{ticket.codigo}</Codigo>
        <PillEstado estado={ticket.estado} espera_de={ticket.espera_de} />
        <PillPrioridad prioridad={ticket.prioridad} />
      </div>
      <Link
        to={`/tickets/${ticket.id}`}
        data-objetivo="cubre-tarjeta"
        className="line-clamp-2 font-medium after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
      >
        {ticket.asunto}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-tinta-2">
        <span>{ticket.cliente?.nombre ?? 'Sin cliente'}</span>
        {pie ?? (
          <FechaLimite
            fecha_limite={ticket.fecha_limite}
            vencido={ticket.vencido}
            vence_hoy={ticket.vence_hoy}
          />
        )}
      </div>
    </article>
  );
}
