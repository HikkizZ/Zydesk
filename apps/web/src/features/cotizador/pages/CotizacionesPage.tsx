import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { TituloPagina } from '@/app/TituloPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { diaMesDeFecha } from '@/components/dominio/formato-fecha';
import { Monto } from '@/components/dominio/Monto';
import { PillEstadoCotizacion } from '@/components/dominio/PillEstadoCotizacion';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BuscadorOts } from '@/features/ots/lista/BuscadorOts';
import { cn } from '@/lib/utils';
import {
  clavesCotizacion,
  cotizaciones,
  STALE_COTIZACIONES,
  type ConsultaCotizaciones,
  type CotizacionResumenDatos,
} from '../api';

const POR_PAGINA = 50;
const REFRESCO_MS = 60_000;

type ClaveChip = 'todas' | 'borrador' | 'enviada' | 'aprobada';

// Cada chip activo es `estado=` en la URL, igual que en la API (ADR 0022: vista, sin acciones).
const CHIPS: { clave: ClaveChip; etiqueta: string }[] = [
  { clave: 'todas', etiqueta: 'Todas' },
  { clave: 'borrador', etiqueta: 'Borradores' },
  { clave: 'enviada', etiqueta: 'Enviadas' },
  { clave: 'aprobada', etiqueta: 'Aprobadas' },
];

const chipActivo = (params: URLSearchParams): ClaveChip =>
  CHIPS.find((c) => c.clave !== 'todas' && params.get('estado') === c.clave)?.clave ?? 'todas';

function Fila({ c }: { c: CotizacionResumenDatos }) {
  return (
    <TableRow>
      <TableCell className="sticky left-0 z-10 bg-superficie">
        <Link
          to={`/cotizaciones/${c.id}`}
          className="font-mono text-sm whitespace-nowrap text-acento underline underline-offset-2"
        >
          {c.codigo} v{c.version}
        </Link>
      </TableCell>
      <TableCell className="max-w-72 min-w-44 whitespace-normal">
        <Link
          to={`/ots/${c.ot.id}`}
          className="font-mono text-sm text-acento underline underline-offset-2"
        >
          {c.ot.codigo}
        </Link>
        <p className="text-xs text-tinta-2">{c.ot.titulo}</p>
      </TableCell>
      <TableCell>
        {c.cliente ? c.cliente.nombre : <span className="text-tinta-3">—</span>}
      </TableCell>
      <TableCell className="whitespace-nowrap">{diaMesDeFecha(c.fecha_emision)}</TableCell>
      <TableCell className="whitespace-nowrap">{diaMesDeFecha(c.vence_el)}</TableCell>
      <TableCell>
        <PillEstadoCotizacion estado={c.estado} />
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Monto valor={c.neto} moneda={c.moneda} />
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Monto valor={c.total} moneda={c.moneda} />
      </TableCell>
    </TableRow>
  );
}

// Lista mínima de cotizaciones (spec fase 4 §11.3): vista de solo lectura; solo las versiones vigentes.
export function CotizacionesPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const chip = chipActivo(params);
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

  const consulta: ConsultaCotizaciones = {
    ...(q ? { q } : {}),
    ...(chip !== 'todas' ? { estado: chip } : {}),
    solo_vigentes: true,
    ...(pagina > 1 ? { pagina } : {}),
    por_pagina: POR_PAGINA,
  };
  const lista = useQuery({
    queryKey: clavesCotizacion.lista(consulta),
    queryFn: () => cotizaciones(consulta),
    staleTime: STALE_COTIZACIONES,
    refetchInterval: REFRESCO_MS,
    placeholderData: keepPreviousData,
  });

  const datos = lista.data;
  const desde = datos ? (datos.pagina - 1) * datos.por_pagina + 1 : 0;
  const hasta = datos ? desde + datos.datos.length - 1 : 0;

  return (
    <div className="flex flex-col gap-4">
      <TituloPagina titulo="Cotizaciones" />

      <div role="group" aria-label="Filtros rápidos" className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.clave}
            type="button"
            aria-pressed={chip === c.clave}
            onClick={() => cambiar({ estado: c.clave === 'todas' ? null : c.clave })}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none lg:min-h-9',
              chip === c.clave
                ? 'border-acento bg-acento text-white'
                : 'border-borde-campo bg-superficie hover:bg-superficie-suave',
            )}
          >
            {c.etiqueta}
          </button>
        ))}
      </div>

      <div role="search" aria-label="Búsqueda" className="flex flex-wrap items-center gap-3">
        <BuscadorOts
          valor={q}
          onCambio={(valor) => cambiar({ q: valor || null })}
          etiqueta="Buscar cotizaciones"
          placeholder="Buscar por código, OT o cliente"
        />
      </div>

      {lista.isPending ? (
        <Cargando />
      ) : lista.isError && !datos ? (
        <EstadoError error={lista.error} reintentar={() => void lista.refetch()} />
      ) : datos && datos.datos.length === 0 ? (
        <EstadoVacio titulo="Sin cotizaciones" descripcion="Se crean desde una OT facturable." />
      ) : datos ? (
        <>
          <div className="rounded-lg border border-borde bg-superficie">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-superficie">Cotización</TableHead>
                  <TableHead>OT</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Emisión</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.datos.map((c) => (
                  <Fila key={c.id} c={c} />
                ))}
              </TableBody>
            </Table>
          </div>
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
