import { pasoVisual, type EstadoFacturacion, type EtapaOt, type TipoOt } from '@zydesk/shared';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// Stepper de la OT (A1): las etapas de su tipo y, si es facturable, "Facturada" como paso derivado.
export function Etapas({
  ot,
}: {
  ot: {
    tipo: TipoOt;
    etapa: EtapaOt;
    estado_facturacion: EstadoFacturacion;
    motivo_cancelacion?: string | null;
  };
}) {
  const { pasos, actual } = pasoVisual(ot);
  const lista = useRef<HTMLOListElement>(null);
  // La etapa actual queda a la vista dentro del `ol` (en celular el stepper desborda y se desplaza).
  useEffect(() => {
    lista.current
      ?.querySelector('[aria-current="step"]')
      ?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [ot.etapa, ot.estado_facturacion]);
  if (ot.etapa === 'cancelada') {
    return (
      <p
        role="status"
        className="rounded-lg border border-borde bg-superficie-suave px-4 py-3 text-sm font-medium"
      >
        Cancelada{ot.motivo_cancelacion ? ` · ${ot.motivo_cancelacion}` : ''}
      </p>
    );
  }
  return (
    <ol
      ref={lista}
      aria-label="Etapas de la OT"
      className="flex items-center gap-2 overflow-x-auto pb-1"
    >
      {pasos.map((etiqueta, i) => {
        const hecho = actual !== null && i < actual;
        const esActual = i === actual;
        return (
          <li
            key={etiqueta}
            {...(esActual ? { 'aria-current': 'step' as const } : {})}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap"
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex size-6 items-center justify-center rounded-full border-2 text-xs font-semibold',
                hecho && 'border-tinta bg-tinta text-white',
                esActual && 'border-acento bg-superficie text-acento',
                !hecho && !esActual && 'border-borde-campo bg-superficie text-tinta-3',
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                'text-sm',
                hecho && 'text-tinta',
                esActual && 'font-semibold text-acento',
                !hecho && !esActual && 'text-tinta-3',
              )}
            >
              {etiqueta}
              {hecho ? <span className="sr-only"> (hecho)</span> : null}
            </span>
            {i < pasos.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn('h-0.5 w-6 shrink-0 rounded', hecho ? 'bg-tinta' : 'bg-borde-campo')}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
