import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { TituloPagina } from '@/app/TituloPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { clavesOt, ots, STALE_OTS, type ConsultaOts } from '@/features/ots/api';
import { useClientesActivos } from '@/features/tickets/components/SelectorCliente';
import { BuscadorOts } from '../lista/BuscadorOts';
import { ChipsOts } from '../lista/ChipsOts';
import {
  CHIPS_OT,
  chipActivoOt,
  consultaDeChipOt,
  PARAMS_CHIP_OT,
  type ClaveChipOt,
} from '../lista/filtros';
import { TablaOts } from '../lista/TablaOts';

const POR_PAGINA = 50;
const REFRESCO_MS = 60_000;

// Lista mínima de OT (spec fase 3 §12): vista de solo lectura, ADR 0022. Los indicadores en pesos y la
// exportación llegan con la pantalla 10 completa (Fase 6).
export function OtsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const clienteParam = Number(params.get('cliente_id'));
  const clienteId = Number.isInteger(clienteParam) && clienteParam > 0 ? clienteParam : null;
  const chip = chipActivoOt(params);
  const paginaParam = Number(params.get('pagina'));
  const pagina = Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam : 1;

  const cambiar = useCallback(
    (cambios: Record<string, string | null>, conservarPagina = false) =>
      setParams(
        (actuales) => {
          const nuevos = new URLSearchParams(actuales);
          for (const [clave, valor] of Object.entries(cambios)) {
            if (valor) nuevos.set(clave, valor);
            else nuevos.delete(clave);
          }
          if (!conservarPagina) nuevos.delete('pagina');
          return nuevos;
        },
        { replace: true },
      ),
    [setParams],
  );

  const elegirChip = (clave: ClaveChipOt) => {
    const cambios: Record<string, string | null> = Object.fromEntries(
      PARAMS_CHIP_OT.map((p) => [p, null]),
    );
    const c = CHIPS_OT.find((x) => x.clave === clave);
    if (c?.param) cambios[c.param] = c.valor;
    cambiar(cambios);
  };

  const base: ConsultaOts = {
    ...(q ? { q } : {}),
    ...(clienteId ? { cliente_id: clienteId } : {}),
  };

  // Contador de cada chip: una petición con `por_pagina=1` y se lee `total`.
  const contadores = useQueries({
    queries: CHIPS_OT.map((c) => {
      const consulta: ConsultaOts = { ...base, ...consultaDeChipOt(c.clave), por_pagina: 1 };
      return {
        queryKey: clavesOt.ots(consulta),
        queryFn: () => ots(consulta),
        staleTime: STALE_OTS,
        refetchInterval: REFRESCO_MS,
        placeholderData: keepPreviousData,
      };
    }),
  });
  const conteo: Partial<Record<ClaveChipOt, number>> = {};
  CHIPS_OT.forEach((c, i) => {
    const total = contadores[i]?.data?.total;
    if (total !== undefined) conteo[c.clave] = total;
  });

  const consulta: ConsultaOts = {
    ...base,
    ...consultaDeChipOt(chip),
    ...(pagina > 1 ? { pagina } : {}),
    por_pagina: POR_PAGINA,
  };
  const lista = useQuery({
    queryKey: clavesOt.ots(consulta),
    queryFn: () => ots(consulta),
    staleTime: STALE_OTS,
    refetchInterval: REFRESCO_MS,
    placeholderData: keepPreviousData,
  });

  const clientes = useClientesActivos();
  const nombreCliente =
    clienteId === null
      ? null
      : (clientes.data?.find((c) => c.id === clienteId)?.nombre ?? `Cliente ${clienteId}`);

  const datos = lista.data;
  const desde = datos ? (datos.pagina - 1) * datos.por_pagina + 1 : 0;
  const hasta = datos ? desde + datos.datos.length - 1 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloPagina titulo="Órdenes de trabajo" />
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex">
              <Button variant="outline" disabled>
                Exportar
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Disponible en la Fase 6</TooltipContent>
        </Tooltip>
      </div>

      <ChipsOts activo={chip} contadores={conteo} onElegir={elegirChip} />

      <div role="search" aria-label="Búsqueda" className="flex flex-wrap items-center gap-3">
        <BuscadorOts valor={q} onCambio={(valor) => cambiar({ q: valor || null })} />
        {nombreCliente ? (
          <Button
            variant="outline"
            size="sm"
            aria-label={`Quitar filtro de cliente: ${nombreCliente}`}
            onClick={() => cambiar({ cliente_id: null })}
          >
            Cliente: {nombreCliente}
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {lista.isPending ? (
        <Cargando />
      ) : lista.isError && !datos ? (
        <EstadoError error={lista.error} reintentar={() => void lista.refetch()} />
      ) : datos && datos.datos.length === 0 ? (
        <EstadoVacio titulo="Sin órdenes de trabajo" descripcion="Se crean desde un ticket." />
      ) : datos ? (
        <>
          <TablaOts ots={datos.datos} />
          <nav
            aria-label="Paginación"
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <p aria-live="polite">
              {desde}–{hasta} de {datos.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={datos.pagina <= 1}
                onClick={() => cambiar({ pagina: String(datos.pagina - 1) }, true)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={hasta >= datos.total}
                onClick={() => cambiar({ pagina: String(datos.pagina + 1) }, true)}
              >
                Siguiente
              </Button>
            </div>
          </nav>
        </>
      ) : null}
    </div>
  );
}
