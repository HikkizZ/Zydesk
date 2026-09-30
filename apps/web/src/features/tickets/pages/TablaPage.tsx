import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { TituloPagina } from '@/app/TituloPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePermiso } from '@/features/auth/SesionProvider';
import { claves, STALE_TICKETS, tickets, type ConsultaTickets } from '@/features/tickets/api';
import { useClientesActivos } from '../components/SelectorCliente';
import { BuscadorTickets } from '../tablero/BuscadorTickets';
import { agrupar, ETIQUETA_AGRUPAR, MODOS_AGRUPAR, type ModoAgrupar } from '../tabla/agrupar';
import { ChipsFiltro } from '../tabla/ChipsFiltro';
import { CHIPS, chipActivo, consultaDeChip, PARAMS_CHIP, type ClaveChip } from '../tabla/filtros';
import { TablaTickets } from '../tabla/TablaTickets';

const POR_PAGINA = 100;
const REFRESCO_MS = 60_000;
const ORDENES = ['-actualizado_en', '-creado_en', 'fecha_limite', 'prioridad'] as const;
type Orden = (typeof ORDENES)[number];

export function TablaPage() {
  const puedeEditar = usePermiso('tickets.editar');
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const clienteParam = Number(params.get('cliente_id'));
  const clienteId = Number.isInteger(clienteParam) && clienteParam > 0 ? clienteParam : null;
  const chip = chipActivo(params);
  const agruparPor: ModoAgrupar =
    MODOS_AGRUPAR.find((m) => m === params.get('agrupar')) ?? 'prioridad';
  const orden: Orden = ORDENES.find((o) => o === params.get('orden')) ?? '-actualizado_en';
  const paginaParam = Number(params.get('pagina'));
  const pagina = Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam : 1;

  // Cualquier cambio de filtro vuelve a la página 1.
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

  const elegirChip = (clave: ClaveChip) => {
    const cambios: Record<string, string | null> = Object.fromEntries(
      PARAMS_CHIP.map((p) => [p, null]),
    );
    const param = CHIPS.find((c) => c.clave === clave)?.param;
    if (param) cambios[param] = 'true';
    cambiar(cambios);
  };

  const base: ConsultaTickets = {
    ...(q ? { q } : {}),
    ...(clienteId ? { cliente_id: clienteId } : {}),
  };

  // Contador de cada chip: una petición con `por_pagina=1` y se lee `total`.
  const chipsConContador = CHIPS.filter((c) => !c.deshabilitado);
  const contadores = useQueries({
    queries: chipsConContador.map((c) => {
      const consulta: ConsultaTickets = { ...base, ...consultaDeChip(c.clave), por_pagina: 1 };
      return {
        queryKey: claves.tickets(consulta),
        queryFn: () => tickets(consulta),
        staleTime: STALE_TICKETS,
        refetchInterval: REFRESCO_MS,
        placeholderData: keepPreviousData,
      };
    }),
  });
  const conteo: Partial<Record<ClaveChip, number>> = {};
  chipsConContador.forEach((c, i) => {
    const total = contadores[i]?.data?.total;
    if (total !== undefined) conteo[c.clave] = total;
  });

  const consulta: ConsultaTickets = {
    ...base,
    ...consultaDeChip(chip),
    ...(orden === '-actualizado_en' ? {} : { orden }),
    ...(pagina > 1 ? { pagina } : {}),
    por_pagina: POR_PAGINA,
  };
  const lista = useQuery({
    queryKey: claves.tickets(consulta),
    queryFn: () => tickets(consulta),
    staleTime: STALE_TICKETS,
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
        <TituloPagina titulo="Tabla" />
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex">
                <Button variant="outline" disabled>
                  Exportar
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Disponible en la Fase 7</TooltipContent>
          </Tooltip>
          {puedeEditar ? (
            <Button asChild>
              <Link to="/tickets/nuevo">Nuevo ticket</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <ChipsFiltro activo={chip} contadores={conteo} onElegir={elegirChip} />

      <div
        role="search"
        aria-label="Búsqueda y agrupación"
        className="flex flex-wrap items-center gap-3"
      >
        <BuscadorTickets valor={q} onCambio={(valor) => cambiar({ q: valor || null })} />
        <div className="flex items-center gap-2">
          <Label htmlFor="agrupar-por">Agrupar por</Label>
          <Select
            value={agruparPor}
            onValueChange={(valor) =>
              cambiar({ agrupar: valor === 'prioridad' ? null : valor }, true)
            }
          >
            <SelectTrigger id="agrupar-por" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODOS_AGRUPAR.map((m) => (
                <SelectItem key={m} value={m}>
                  {ETIQUETA_AGRUPAR[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
        <EstadoVacio
          titulo="Sin tickets"
          descripcion="Ningún ticket coincide con los filtros elegidos."
        />
      ) : datos ? (
        <>
          <TablaTickets
            grupos={agrupar(datos.datos, agruparPor)}
            orden={orden}
            onOrden={(o) => cambiar({ orden: o === '-actualizado_en' ? null : o })}
          />
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
