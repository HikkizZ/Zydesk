import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TonoChip =
  'neutro' | 'acento' | 'suave-atento' | 'suave-ok' | 'suave-vencido' | 'interna';

const TONOS: Record<TonoChip, string> = {
  neutro: 'bg-panel-hundido text-tinta-2',
  acento: 'bg-acento-suave text-acento',
  'suave-atento': 'bg-plazo-atento-suave text-plazo-atento',
  'suave-ok': 'bg-plazo-ok-suave text-plazo-ok',
  'suave-vencido': 'bg-plazo-vencido-suave text-plazo-vencido',
  interna: 'bg-interna-suave text-interna',
};

// Metadato con menos énfasis que los nombres (folios enlazados, tipo, «Facturable»). Siempre lleva texto.
export function Chip({
  tono = 'neutro',
  icono: Icono,
  punto,
  children,
  className,
}: {
  tono?: TonoChip;
  icono?: LucideIcon;
  punto?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-xs whitespace-nowrap',
        TONOS[tono],
        className,
      )}
    >
      {Icono ? <Icono aria-hidden="true" className="size-3 shrink-0" /> : null}
      {punto ? (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}

// --- Alias de transición (se eliminan en F10-T16): la API de la antigua `Pill` sobre `Chip`. ---
export type TonoPill =
  'neutro' | 'acento' | 'urgente' | 'alta' | 'resuelto' | 'en-espera' | 'interna';

const TONO_PILL: Record<TonoPill, TonoChip> = {
  neutro: 'neutro',
  acento: 'acento',
  urgente: 'suave-vencido',
  alta: 'suave-atento',
  resuelto: 'suave-ok',
  'en-espera': 'suave-atento',
  interna: 'interna',
};

export function Pill({ tono, children }: { tono: TonoPill; children: ReactNode }) {
  return (
    <Chip tono={TONO_PILL[tono]} punto={tono === 'interna'}>
      {children}
    </Chip>
  );
}
