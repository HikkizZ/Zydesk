import type { Moneda } from '@zydesk/shared';
import { Link } from 'react-router';
import { Monto } from '@/components/dominio/Monto';
import { PillEstadoCotizacion } from '@/components/dominio/PillEstadoCotizacion';
import { diaMes } from '@/components/dominio/formato-fecha';
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
    <section
      aria-label="Versiones"
      className={`rounded-lg border border-borde bg-superficie p-4 ${className ?? ''}`}
    >
      <h2 className="mb-2 font-titulo text-base font-semibold">Versiones</h2>
      <ul className="flex flex-col gap-1">
        {[...cotizacion.versiones]
          .sort((a, b) => b.version - a.version)
          .map((v) => {
            const actual = v.id === cotizacion.id;
            const fecha = v.aprobada_en ?? v.enviada_en;
            return (
              <li key={v.id}>
                <Link
                  to={`/cotizaciones/${v.id}`}
                  {...(actual ? { 'aria-current': 'page' as const } : {})}
                  className={
                    actual
                      ? 'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-superficie-suave px-2 py-1.5 text-sm font-semibold'
                      : 'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 text-sm hover:bg-superficie-suave'
                  }
                >
                  <span className="font-mono">v{v.version}</span>
                  <PillEstadoCotizacion estado={v.estado} />
                  <Monto valor={v.total} moneda={moneda} />
                  {fecha ? <span className="text-xs text-tinta-2">{diaMes(fecha)}</span> : null}
                </Link>
              </li>
            );
          })}
      </ul>
    </section>
  );
}
