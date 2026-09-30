import { ETIQUETA_ESPERA_DE, esCerrado } from '@zydesk/shared';
import { Mail, MessageSquare } from 'lucide-react';
import { Link } from 'react-router';
import { Avatares } from '@/components/dominio/Avatares';
import { Codigo } from '@/components/dominio/Codigo';
import { FechaLimite } from '@/components/dominio/FechaLimite';
import { Pill } from '@/components/dominio/Pill';
import { PillPrioridad } from '@/components/dominio/PillPrioridad';
import type { TicketResumenDatos } from '@/features/tickets/api';

const recortar = (texto: string, max: number) =>
  texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;

function EtiquetaCierre({ ticket }: { ticket: TicketResumenDatos }) {
  if (ticket.estado === 'resuelto') return <Pill tono="resuelto">Resuelto</Pill>;
  if (ticket.estado === 'descartado') {
    const motivo = ticket.motivo_cierre ? ` · ${recortar(ticket.motivo_cierre, 28)}` : '';
    return (
      <Pill tono="neutro">
        <span className="line-through">{`Descartado${motivo}`}</span>
      </Pill>
    );
  }
  return (
    <Pill tono="neutro">
      {ticket.duplicado_de ? `Duplicado de ${ticket.duplicado_de.codigo}` : 'Duplicado'}
    </Pill>
  );
}

function Etiquetas({ ticket }: { ticket: TicketResumenDatos }) {
  const hay = ticket.tiene_correo || ticket.estado === 'en_espera' || esCerrado(ticket.estado);
  if (!hay) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ticket.tiene_correo ? (
        <Pill tono="neutro">
          <Mail aria-hidden="true" className="size-3" />
          Correo
        </Pill>
      ) : null}
      {ticket.estado === 'en_espera' && ticket.espera_de ? (
        <Pill tono="en-espera">Espera: {ETIQUETA_ESPERA_DE[ticket.espera_de]}</Pill>
      ) : null}
      {esCerrado(ticket.estado) ? <EtiquetaCierre ticket={ticket} /> : null}
    </div>
  );
}

// Toda la tarjeta es un enlace al detalle (enlace extendido sobre el asunto): operable con teclado
// y con foco visible sobre la tarjeta entera. El tablero no edita nada.
export function TarjetaTicket({ ticket }: { ticket: TicketResumenDatos }) {
  return (
    <article
      aria-label={`${ticket.codigo} ${ticket.asunto}`}
      className="relative flex min-h-11 flex-col gap-2 rounded-lg border border-borde bg-superficie p-3 shadow-sm transition-colors hover:border-borde-campo hover:bg-superficie-suave"
    >
      <div className="flex items-center gap-2">
        <Codigo>{ticket.codigo}</Codigo>
        <PillPrioridad prioridad={ticket.prioridad} />
      </div>
      <Link
        to={`/tickets/${ticket.id}`}
        className="line-clamp-2 font-medium after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
      >
        {ticket.asunto}
      </Link>
      <p className="text-sm text-tinta-2">{ticket.cliente?.nombre ?? 'Sin cliente'}</p>
      <Etiquetas ticket={ticket} />
      <div className="mt-1 flex items-center gap-3">
        {ticket.responsables.length > 0 ? (
          <Avatares personas={ticket.responsables} />
        ) : (
          <span className="text-sm text-alta">Sin asignar</span>
        )}
        <FechaLimite
          fecha_limite={ticket.fecha_limite}
          vencido={ticket.vencido}
          vence_hoy={ticket.vence_hoy}
          className="ml-auto"
        />
        <span
          className="inline-flex items-center gap-1 text-sm text-tinta-2"
          aria-label={`${ticket.n_mensajes} ${ticket.n_mensajes === 1 ? 'mensaje' : 'mensajes'}`}
        >
          <MessageSquare aria-hidden="true" className="size-3.5" />
          {ticket.n_mensajes}
        </span>
      </div>
    </article>
  );
}
