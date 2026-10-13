import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export type TonoIndicador = 'neutro' | 'acento' | 'ok' | 'atento' | 'vencido';

export interface ItemIndicador {
  etiqueta: string;
  valor: ReactNode;
  /** Punto de color antes de la cifra (opcional). */
  tono?: TonoIndicador;
  to?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

const PUNTO: Record<TonoIndicador, string> = {
  neutro: 'bg-tinta-4',
  acento: 'bg-acento',
  ok: 'bg-plazo-ok',
  atento: 'bg-plazo-atento',
  vencido: 'bg-plazo-vencido',
};

const CELDA = 'inline-flex flex-wrap items-center gap-x-1.5';
const INTERACTIVA = 'min-h-11 hover:text-tinta lg:min-h-0';

function Indicador({ item }: { item: ItemIndicador }) {
  const contenido = (
    <>
      {item.tono ? (
        <span
          aria-hidden="true"
          className={cn('size-1.5 shrink-0 rounded-full', PUNTO[item.tono])}
        />
      ) : null}
      <span className="font-medium text-tinta tabular-nums">{item.valor}</span>{' '}
      <span>{item.etiqueta}</span>
    </>
  );
  const aria = item.ariaLabel ? { 'aria-label': item.ariaLabel } : {};
  if (item.to) {
    return (
      <Link to={item.to} {...aria} className={cn(CELDA, INTERACTIVA)}>
        {contenido}
      </Link>
    );
  }
  if (item.onClick) {
    return (
      <button type="button" onClick={item.onClick} {...aria} className={cn(CELDA, INTERACTIVA)}>
        {contenido}
      </button>
    );
  }
  return (
    <span {...(item.ariaLabel ? { role: 'group', ...aria } : {})} className={CELDA}>
      {contenido}
    </span>
  );
}

// Línea compacta de indicadores: bajo `md`, grilla de 2 columnas.
export function LineaIndicadores({
  items,
  className,
}: {
  items: ItemIndicador[];
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Indicadores"
      className={cn(
        'grid grid-cols-2 gap-x-5 gap-y-2 border-b border-linea-fuerte pb-4 text-sm text-tinta-2 md:flex md:flex-wrap md:items-center',
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.etiqueta}
          className="md:border-l md:border-linea-fuerte md:pl-5 md:first:border-l-0 md:first:pl-0"
        >
          <Indicador item={item} />
        </div>
      ))}
    </div>
  );
}
