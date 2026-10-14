import { useQuery } from '@tanstack/react-query';
import { Monto } from '@/components/dominio/Monto';
import { LineaIndicadores } from '@/components/dominio/LineaIndicadores';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { clavesOt, indicadoresOts, STALE_OTS, type IndicadoresOtsDatos } from '@/features/ots/api';
import { formatearHoras } from '@/lib/formato';

const REFRESCO_MS = 60_000;
const SIN_PERMISO_MONTOS = 'Los montos requieren el permiso Ver reportes y montos';

const textoOt = (n: number) => `${n} OT`;

// Sin `reportes.ver` la API devuelve `neto: null`: se muestra «—» con la razón.
export function MontoOculto() {
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
      <span className="font-normal text-tinta-2"> · {textoOt(n)}</span>
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
    <LineaIndicadores
      items={[
        {
          etiqueta: 'Por facturar',
          tono: 'atento',
          to: '/ots?estado_facturacion=por_facturar',
          valor: <ConMonto n={datos.por_facturar.n} neto={datos.por_facturar.neto} />,
        },
        {
          etiqueta: 'Esperando al cliente',
          tono: 'neutro',
          to: '/ots?etapa=cotizada',
          valor: <ConMonto n={datos.esperando_cliente.n} neto={datos.esperando_cliente.neto} />,
        },
        {
          etiqueta: 'En ejecución',
          tono: 'acento',
          to: '/ots?etapa=en_ejecucion',
          valor: textoOt(datos.en_ejecucion),
        },
        {
          etiqueta: 'Horas internas del mes',
          to: '/ots?tipo=interna',
          valor: formatearHoras(datos.horas_internas_mes),
        },
      ]}
    />
  );
}
