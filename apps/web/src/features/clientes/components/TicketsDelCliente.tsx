import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Cargando } from '@/components/dominio/Cargando';
import { Codigo } from '@/components/dominio/Codigo';
import { EstadoError } from '@/components/dominio/EstadoError';
import { FechaLimite } from '@/components/dominio/FechaLimite';
import { PillEstado } from '@/components/dominio/PillEstado';
import { claves, STALE_TICKETS, tickets, type ConsultaTickets } from '@/features/tickets/api';

// Los 20 tickets más recientes del cliente (`GET /api/tickets?cliente_id`), activos y cerrados.
export function TicketsDelCliente({ clienteId }: { clienteId: number }) {
  const consulta: ConsultaTickets = { cliente_id: clienteId, por_pagina: 20 };
  const lista = useQuery({
    queryKey: claves.tickets(consulta),
    queryFn: () => tickets(consulta),
    staleTime: STALE_TICKETS,
  });

  if (lista.isPending) return <Cargando />;
  if (lista.isError) {
    return <EstadoError error={lista.error} reintentar={() => void lista.refetch()} />;
  }
  if (lista.data.datos.length === 0) {
    return <p className="text-tinta-2">Este cliente aún no tiene tickets.</p>;
  }
  return (
    <ul className="divide-y divide-borde">
      {lista.data.datos.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
          <Link
            to={`/tickets/${t.id}`}
            className="inline-flex min-h-11 items-center text-acento underline-offset-2 hover:underline lg:min-h-0"
          >
            <Codigo>{t.codigo}</Codigo>
          </Link>
          <span className="min-w-0 flex-1 basis-48 font-medium">{t.asunto}</span>
          <PillEstado estado={t.estado} espera_de={t.espera_de} />
          <FechaLimite
            fecha_limite={t.fecha_limite}
            vencido={t.vencido}
            vence_hoy={t.vence_hoy}
            prefijo="Vence"
          />
        </li>
      ))}
    </ul>
  );
}
