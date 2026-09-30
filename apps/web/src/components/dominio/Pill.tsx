import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TonoPill =
  'neutro' | 'acento' | 'urgente' | 'alta' | 'resuelto' | 'en-espera' | 'interna';

const TONOS: Record<TonoPill, { pill: string; punto: string }> = {
  neutro: { pill: 'bg-baja-fondo text-baja', punto: 'bg-baja-punto' },
  acento: { pill: 'bg-media-fondo text-media', punto: 'bg-media-punto' },
  urgente: { pill: 'bg-urgente-fondo text-urgente', punto: 'bg-urgente-punto' },
  alta: { pill: 'bg-alta-fondo text-alta', punto: 'bg-alta-punto' },
  resuelto: { pill: 'bg-resuelto-fondo text-resuelto', punto: 'bg-resuelto' },
  'en-espera': { pill: 'bg-en-espera-fondo text-en-espera', punto: 'bg-en-espera' },
  interna: { pill: 'bg-interna-fondo text-interna', punto: 'bg-interna' },
};

// Estado, prioridad y tipo nunca solo por color: siempre texto más un punto decorativo (ADR 0011).
export function Pill({ tono, children }: { tono: TonoPill; children: ReactNode }) {
  const t = TONOS[tono];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        t.pill,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', t.punto)} />
      {children}
    </span>
  );
}
