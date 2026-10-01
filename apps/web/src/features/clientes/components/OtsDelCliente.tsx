import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Cargando } from '@/components/dominio/Cargando';
import { Codigo } from '@/components/dominio/Codigo';
import { EstadoError } from '@/components/dominio/EstadoError';
import { PillEtapaOt } from '@/components/dominio/PillEtapaOt';
import { PillFacturacion } from '@/components/dominio/PillFacturacion';
import { PillTipoOt } from '@/components/dominio/PillTipoOt';
import { clavesOt, ots, STALE_OTS, type ConsultaOts } from '@/features/ots/api';

// Las 20 OT más recientes del cliente (`GET /api/ots?cliente_id`), abiertas y cerradas.
export function OtsDelCliente({ clienteId }: { clienteId: number }) {
  const consulta: ConsultaOts = { cliente_id: clienteId, por_pagina: 20 };
  const lista = useQuery({
    queryKey: clavesOt.ots(consulta),
    queryFn: () => ots(consulta),
    staleTime: STALE_OTS,
  });

  if (lista.isPending) return <Cargando />;
  if (lista.isError) {
    return <EstadoError error={lista.error} reintentar={() => void lista.refetch()} />;
  }
  if (lista.data.datos.length === 0) {
    return <p className="text-tinta-2">Este cliente aún no tiene órdenes de trabajo.</p>;
  }
  return (
    <ul className="divide-y divide-borde">
      {lista.data.datos.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
          <Link
            to={`/ots/${o.id}`}
            className="inline-flex min-h-11 items-center text-acento underline-offset-2 hover:underline lg:min-h-0"
          >
            <Codigo>{o.codigo}</Codigo>
          </Link>
          <span className="min-w-0 flex-1 basis-48 font-medium">{o.titulo}</span>
          <PillTipoOt tipo={o.tipo} />
          <PillEtapaOt etapa={o.etapa} />
          {o.tipo === 'facturable' ? <PillFacturacion estado={o.estado_facturacion} /> : null}
        </li>
      ))}
    </ul>
  );
}
