import type { Moneda } from '@zydesk/shared';
import { Link } from 'react-router';
import { Monto } from '@/components/dominio/Monto';
import { PillEstadoCotizacion } from '@/components/dominio/PillEstadoCotizacion';
import { diaMes } from '@/components/dominio/formato-fecha';
import { cn } from '@/lib/utils';
import type { CotizacionSalidaDatos } from '../api';

// Todas las versiones de la OT; la actual va marcada y cada una enlaza a su cotización.
export function VersionesCotizacion({
  cotizacion,
  className,
}: {
  cotizacion: CotizacionSalidaDatos;
  className?: string;
}) {
  const moneda: Moneda = cotizacion.moneda;
  return (
    <section aria-label="Versiones" className={className}>
      <h2 className="sr-only">Versiones</h2>
      <ul className="-mb-px flex overflow-x-auto border-b border-linea-fuerte">
        {[...cotizacion.versiones]
          .sort((a, b) => b.version - a.version)
          .map((v) => {
            const actual = v.id === cotizacion.id;
            const fecha = v.aprobada_en ?? v.enviada_en;
            return (
              <li key={v.id} className="flex-none">
                <Link
                  to={`/cotizaciones/${v.id}`}
                  {...(actual ? { 'aria-current': 'page' as const } : {})}
                  className={cn(
                    'flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 border-b-2 px-3 text-sm whitespace-nowrap lg:min-h-9',
                    actual
                      ? 'border-acento font-medium text-tinta'
                      : 'border-transparent text-tinta-2 hover:text-tinta',
                  )}
                >
                  <span className="font-mono">v{v.version}</span>
                  <PillEstadoCotizacion estado={v.estado} />
                  <Monto valor={v.total} moneda={moneda} />
                  {fecha ? <span className="text-xs text-tinta-3">{diaMes(fecha)}</span> : null}
                </Link>
              </li>
            );
          })}
      </ul>
    </section>
  );
}
