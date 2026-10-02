import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Monto } from '@/components/dominio/Monto';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { clavesOt, indicadoresOts, STALE_OTS, type IndicadoresOtsDatos } from '@/features/ots/api';
import { formatearHoras } from '@/lib/formato';
import { cn } from '@/lib/utils';

const REFRESCO_MS = 60_000;
const SIN_PERMISO_MONTOS = 'Los montos requieren el permiso Ver reportes y montos';

const textoOt = (n: number) => `${n} OT`;

function Tarjeta({
  etiqueta,
  to,
  tono,
  children,
}: {
  etiqueta: string;
  to: string;
  tono: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-11 flex-col gap-1 rounded-lg border border-borde bg-superficie p-4 transition-colors hover:bg-superficie-suave focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="text-sm text-tinta-2">{etiqueta}</span>
      <span className={cn('font-titulo text-2xl font-bold tabular-nums', tono)}>{children}</span>
    </Link>
  );
}

// Sin `reportes.ver` la API devuelve `neto: null`: se muestra «—» con la razón.
function MontoOculto() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={SIN_PERMISO_MONTOS}>
          —
        </span>
      </TooltipTrigger>
      <TooltipContent>{SIN_PERMISO_MONTOS}</TooltipContent>
    </Tooltip>
  );
}

function ConMonto({ n, neto }: { n: number; neto: number | null }) {
  return (
    <>
      {neto === null ? <MontoOculto /> : <Monto valor={neto} />}
      <span className="text-sm font-normal text-tinta-2"> · {textoOt(n)}</span>
    </>
  );
}

// Cada tarjeta enlaza al filtro correspondiente; `esperando_cliente` no es un filtro de la API y
// enlaza a la etapa Cotizada (spec fase 6 §18.1).
export function IndicadoresOts() {
  const consulta = useQuery({
    queryKey: clavesOt.indicadores,
    queryFn: indicadoresOts,
    staleTime: STALE_OTS,
    refetchInterval: REFRESCO_MS,
  });
  const datos: IndicadoresOtsDatos | undefined = consulta.data;
  if (!datos) return null;
  return (
    <div role="group" aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tarjeta etiqueta="Por facturar" to="/ots?estado_facturacion=por_facturar" tono="text-alta">
        <ConMonto n={datos.por_facturar.n} neto={datos.por_facturar.neto} />
      </Tarjeta>
      <Tarjeta etiqueta="Esperando al cliente" to="/ots?etapa=cotizada" tono="text-tinta">
        <ConMonto n={datos.esperando_cliente.n} neto={datos.esperando_cliente.neto} />
      </Tarjeta>
      <Tarjeta etiqueta="En ejecución" to="/ots?etapa=en_ejecucion" tono="text-acento">
        {textoOt(datos.en_ejecucion)}
      </Tarjeta>
      <Tarjeta etiqueta="Horas internas del mes" to="/ots?tipo=interna" tono="text-interna">
        {formatearHoras(datos.horas_internas_mes)}
      </Tarjeta>
    </div>
  );
}
