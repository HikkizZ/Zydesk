import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

const CLASES =
  'flex min-h-11 flex-col gap-1 rounded-lg border border-borde bg-superficie p-4 transition-colors';

// Tarjeta de indicador de las pantallas 10 (OT) y 14 (Reportes): con `to` es un enlace; sin él, un bloque.
export function TarjetaIndicador({
  etiqueta,
  to,
  tono,
  ariaLabel,
  children,
}: {
  etiqueta: string;
  to?: string;
  tono: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const contenido = (
    <>
      <span className="text-sm text-tinta-2">{etiqueta}</span>
      <span className={cn('font-titulo text-2xl font-bold tabular-nums', tono)}>{children}</span>
    </>
  );
  return to ? (
    <Link
      to={to}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      className={cn(
        CLASES,
        'hover:bg-superficie-suave focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
      )}
    >
      {contenido}
    </Link>
  ) : (
    <div role="group" {...(ariaLabel ? { 'aria-label': ariaLabel } : {})} className={CLASES}>
      {contenido}
    </div>
  );
}
