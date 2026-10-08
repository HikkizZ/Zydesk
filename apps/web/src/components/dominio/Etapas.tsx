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
        className="rounded-md border border-linea bg-panel-hundido px-4 py-3 text-sm font-medium text-tinta"
      >
        Cancelada{ot.motivo_cancelacion ? ` · ${ot.motivo_cancelacion}` : ''}
      </p>
    );
  }
  return (
    <ol
      ref={lista}
      aria-label="Etapas de la OT"
      tabIndex={0}
      className="relative flex items-center gap-2 overflow-x-auto pb-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
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
                'inline-block size-2 shrink-0 rounded-full border',
                hecho && 'border-tinta-4 bg-tinta-4',
                esActual && 'border-acento bg-acento',
                !hecho && !esActual && 'border-linea-campo bg-panel',
              )}
            />
            <span
              className={cn(
                'text-sm',
                hecho && 'text-tinta-2',
                esActual && 'font-medium text-tinta',
                !hecho && !esActual && 'text-tinta-3',
              )}
            >
              {etiqueta}
              {hecho ? <span className="sr-only"> (hecho)</span> : null}
            </span>
            {i < pasos.length - 1 ? (
              <span aria-hidden="true" className="h-px w-6 shrink-0 bg-linea-fuerte" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
