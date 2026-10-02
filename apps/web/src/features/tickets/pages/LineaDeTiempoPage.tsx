import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { TituloPagina } from '@/app/TituloPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { diaMesDeFecha, hoyIso } from '@/components/dominio/formato-fecha';
import { useYo } from '@/features/auth/SesionProvider';
import { clavesLineaTiempo, lineaDeTiempo, STALE_TICKETS } from '@/features/tickets/api';
import { formatearFechaLarga } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { Controles, type Agrupar } from '../linea-tiempo/Controles';
import { Cuadricula } from '../linea-tiempo/Cuadricula';
import { filasPorCliente, filasPorPersona } from '../linea-tiempo/disposicion';
import {
  consultaDeEscala,
  desdePorDefecto,
  ESCALAS,
  esFechaIso,
  moverRango,
  normalizarDesde,
  rangoDeEscala,
  type Escala,
} from '../linea-tiempo/rango';

const REFRESCO_MS = 60_000;

// Estado en la URL (ADR 0016): `escala`, `agrupar`, `desde` y `vencidos`.
export function LineaDeTiempoPage() {
  const yo = useYo();
  const [params, setParams] = useSearchParams();
  const hoyLocal = hoyIso();

  const escalaParam = params.get('escala');
  const escala: Escala = ESCALAS.find((e) => e === escalaParam) ?? '2semanas';
  const agrupar: Agrupar = params.get('agrupar') === 'cliente' ? 'cliente' : 'persona';
  const desdeParam = params.get('desde');
  const desde = normalizarDesde(
    escala,
    esFechaIso(desdeParam) ? desdeParam : desdePorDefecto(escala, hoyLocal),
  );
  const soloVencidos = params.get('vencidos') === 'true';

  const cambiar = useCallback(
    (cambios: Record<string, string | null>) =>
      setParams(
        (actuales) => {
          const nuevos = new URLSearchParams(actuales);
          for (const [clave, valor] of Object.entries(cambios)) {
            if (valor) nuevos.set(clave, valor);
            else nuevos.delete(clave);
          }
          return nuevos;
        },
        { replace: true },
      ),
    [setParams],
  );

  const consulta = consultaDeEscala(escala, desde);
  const linea = useQuery({
    queryKey: clavesLineaTiempo.rango(consulta.desde, consulta.hasta),
    queryFn: () => lineaDeTiempo(consulta.desde, consulta.hasta),
    staleTime: STALE_TICKETS,
    refetchInterval: REFRESCO_MS,
    placeholderData: keepPreviousData,
  });
  const datos = linea.data;

  const rango = datos ? rangoDeEscala(escala, desde, datos.dias) : null;
  const hoy = datos?.dias.find((d) => d.hoy)?.fecha ?? hoyLocal;
  const filas = datos
    ? agrupar === 'cliente'
      ? filasPorCliente(datos.items)
      : filasPorPersona(datos.items, datos.personas, yo.id)
    : [];

  const etiquetaRango =
    escala === 'dia'
      ? formatearFechaLarga(desde)
      : rango
        ? `${diaMesDeFecha(rango.desde)} – ${diaMesDeFecha(rango.hasta)}`
        : '';

  return (
    <div className="flex flex-col gap-4">
      <TituloPagina titulo="Línea de tiempo" />
      <Controles
        escala={escala}
        agrupar={agrupar}
        etiquetaRango={etiquetaRango}
        onEscala={(e) => cambiar({ escala: e === '2semanas' ? null : e, desde: null })}
        onAgrupar={(a) => cambiar({ agrupar: a === 'persona' ? null : a })}
        onMover={(sentido) => cambiar({ desde: moverRango(escala, desde, sentido) })}
        onHoy={() => cambiar({ desde: null })}
      />

      {datos && datos.vencidos > 0 ? (
        <button
          type="button"
          aria-pressed={soloVencidos}
          onClick={() => cambiar({ vencidos: soloVencidos ? null : 'true' })}
          className={cn(
            'inline-flex min-h-11 w-fit items-center gap-2 rounded-lg border px-3 text-sm font-semibold focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none lg:min-h-9',
            soloVencidos
              ? 'border-urgente bg-urgente text-white'
              : 'border-urgente-punto bg-urgente-fondo text-urgente',
          )}
        >
          <TriangleAlert aria-hidden="true" className="size-4" />
          {datos.vencidos} {datos.vencidos === 1 ? 'vencido' : 'vencidos'}
        </button>
      ) : null}

      {linea.isPending ? (
        <Cargando />
      ) : linea.isError && !datos ? (
        <EstadoError error={linea.error} reintentar={() => void linea.refetch()} />
      ) : datos && rango ? (
        rango.columnas.length === 0 ? (
          <EstadoVacio
            titulo="No es un día hábil"
            descripcion="Elige otro día o cambia de escala."
          />
        ) : filas.length === 0 ? (
          <EstadoVacio titulo="Sin tickets en este rango" />
        ) : (
          <Cuadricula
            columnas={rango.columnas}
            filas={filas}
            hoy={hoy}
            soloVencidos={soloVencidos}
            mostrarAhora={agrupar === 'persona'}
          />
        )
      ) : null}
    </div>
  );
}
