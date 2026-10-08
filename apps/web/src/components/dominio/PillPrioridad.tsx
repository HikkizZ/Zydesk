import { ChevronDown, ChevronsUp, ChevronUp, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { ETIQUETA_PRIORIDAD, type Prioridad } from '@zydesk/shared';
import { cn } from '@/lib/utils';

const ESTILO: Record<Prioridad, { icono: ReactNode; texto: string }> = {
  urgente: {
    icono: <ChevronsUp aria-hidden="true" className="size-3.5 shrink-0 text-plazo-vencido" />,
    texto: 'font-medium text-plazo-vencido',
  },
  alta: {
    icono: <ChevronUp aria-hidden="true" className="size-3.5 shrink-0 text-plazo-atento" />,
    texto: 'text-tinta-2',
  },
  media: {
    icono: <Minus aria-hidden="true" className="size-3.5 shrink-0 text-tinta-4" />,
    texto: 'text-tinta-2',
  },
  baja: {
    icono: <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-tinta-4" />,
    texto: 'text-tinta-3',
  },
};

// Glifo + texto: la prioridad nunca va solo por color (ADR 0011).
export function PillPrioridad({ prioridad }: { prioridad: Prioridad }) {
  const { icono, texto } = ESTILO[prioridad];
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs whitespace-nowrap', texto)}>
      {icono}
      {ETIQUETA_PRIORIDAD[prioridad]}
    </span>
  );
}
