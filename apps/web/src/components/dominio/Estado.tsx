import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TonoEstado =
  | 'nuevo'
  | 'en-curso'
  | 'en-espera'
  | 'resuelto'
  | 'cerrado'
  | 'borrador'
  | 'ejecucion'
  | 'cotizada'
  | 'por-aprobar'
  | 'facturada'
  | 'interna';

const PUNTO: Record<TonoEstado, string> = {
  nuevo: 'bg-estado-nuevo',
  'en-curso': 'bg-acento',
  'en-espera': 'bg-plazo-atento',
  resuelto: 'bg-plazo-ok',
  cerrado: 'bg-tinta-4',
  borrador: 'bg-estado-nuevo',
  ejecucion: 'bg-acento',
  cotizada: 'bg-plazo-atento',
  'por-aprobar': 'bg-plazo-atento',
  facturada: 'bg-plazo-ok',
  interna: 'bg-interna',
};

// Estado = punto de color + texto, sin fondo. Nunca solo por color (ADR 0011, 0033).
export function Estado({
  tono,
  children,
  className,
}: {
  tono: TonoEstado;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-tinta-2',
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', PUNTO[tono])} />
      {children}
    </span>
  );
}
