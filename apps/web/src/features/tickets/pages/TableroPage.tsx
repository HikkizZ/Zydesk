import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PRIORIDADES, type Prioridad } from '@zydesk/shared';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { TituloPagina } from '@/app/TituloPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError } from '@/components/dominio/EstadoError';
import { Button } from '@/components/ui/button';
import { usePermiso } from '@/features/auth/SesionProvider';
import { claves, STALE_TICKETS, tablero, type ConsultaTablero } from '@/features/tickets/api';
import { FiltrosTablero, type ValoresFiltrosTablero } from '../tablero/FiltrosTablero';
import { Tablero } from '../tablero/Tablero';

const REFRESCO_MS = 60_000;

function leerFiltros(params: URLSearchParams): ValoresFiltrosTablero {
  const responsable = Number(params.get('responsable_id'));
  const prioridades = (params.get('prioridad') ?? '').split(',');
  return {
    q: params.get('q') ?? '',
    responsable: Number.isInteger(responsable) && responsable > 0 ? responsable : null,
    prioridad: PRIORIDADES.filter((p): p is Prioridad => prioridades.includes(p)),
    soloMios: params.get('solo_mios') === 'true',
  };
}

export function TableroPage() {
  const puedeEditar = usePermiso('tickets.editar');
  const [params, setParams] = useSearchParams();
  const filtros = leerFiltros(params);

  const cambiarFiltros = useCallback(
    (cambios: Partial<ValoresFiltrosTablero>) =>
      setParams(
        (actuales) => {
          const nuevos = new URLSearchParams(actuales);
          const poner = (clave: string, valor: string | null) =>
            valor ? nuevos.set(clave, valor) : nuevos.delete(clave);
          if ('q' in cambios) poner('q', cambios.q || null);
          if ('responsable' in cambios) {
            poner('responsable_id', cambios.responsable ? String(cambios.responsable) : null);
          }
          if ('prioridad' in cambios) poner('prioridad', cambios.prioridad?.join(',') || null);
          if ('soloMios' in cambios) poner('solo_mios', cambios.soloMios ? 'true' : null);
          return nuevos;
        },
        { replace: true },
      ),
    [setParams],
  );

  const consulta: ConsultaTablero = {
    ...(filtros.q ? { q: filtros.q } : {}),
    ...(filtros.responsable ? { responsable_id: filtros.responsable } : {}),
    ...(filtros.prioridad.length > 0 ? { prioridad: filtros.prioridad.join(',') } : {}),
    ...(filtros.soloMios ? { solo_mios: true } : {}),
  };
  const tickets = useQuery({
    queryKey: claves.tablero(consulta),
    queryFn: () => tablero(consulta),
    staleTime: STALE_TICKETS,
    refetchInterval: REFRESCO_MS,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloPagina titulo="Tablero" />
        {puedeEditar ? (
          <Button asChild>
            <Link to="/tickets/nuevo">Nuevo ticket</Link>
          </Button>
        ) : null}
      </div>
      <FiltrosTablero valores={filtros} onCambio={cambiarFiltros} />
      {tickets.isPending ? (
        <Cargando />
      ) : tickets.isError && !tickets.data ? (
        <EstadoError error={tickets.error} reintentar={() => void tickets.refetch()} />
      ) : (
        <Tablero tickets={tickets.data ?? []} />
      )}
    </div>
  );
}
