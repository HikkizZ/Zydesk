import { ETIQUETA_PRIORIDAD, type EstadoTicket, type Prioridad } from '@zydesk/shared';
import { TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import type { Barra } from './disposicion';

const COLOR_PRIORIDAD: Record<Prioridad, string> = {
  urgente: 'bg-plazo-vencido',
  alta: 'bg-plazo-atento',
  media: 'bg-tinta-4',
  baja: 'bg-tinta-4',
};

// Estado nunca solo por color: relleno lleno, borde punteado y rayado se distinguen también en gris.
const ESTILO_ESTADO: Record<EstadoTicket, string> = {
  en_curso: 'border border-acento/40 bg-acento-suave text-acento',
  nuevo: 'border border-dashed border-tinta-3 bg-panel text-tinta',
  en_espera:
    'border border-plazo-atento/40 bg-[repeating-linear-gradient(135deg,var(--color-plazo-atento-suave)_0_6px,color-mix(in_srgb,var(--color-plazo-atento)_22%,var(--color-plazo-atento-suave))_6px_12px)] text-plazo-atento',
  resuelto: 'bg-panel-hundido text-tinta-3',
  descartado: 'bg-panel-hundido text-tinta-3',
  duplicado: 'bg-panel-hundido text-tinta-3',
};

const recortar = (texto: string, max: number) =>
  texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;

// Punto de prioridad compacto (con `aria-label`; el color no es la única señal).
function PuntoPrioridad({ prioridad }: { prioridad: Prioridad }) {
  return (
    <span
      role="img"
      aria-label={`Prioridad ${ETIQUETA_PRIORIDAD[prioridad].toLowerCase()}`}
      className={cn('size-2 shrink-0 rounded-full ring-1 ring-panel', COLOR_PRIORIDAD[prioridad])}
    />
  );
}

// Barra de un ticket: `<a>` al detalle (la línea de tiempo no edita nada, ADR 0022). Se ubica con
// `grid-column`/`grid-row`; las columnas empiezan en la 2 porque la 1 es la de nombres.
export function BarraTicket({ barra }: { barra: Barra }) {
  const { item } = barra;
  const sinFecha = item.limite === null;
  const texto = `${item.codigo} ${recortar(item.asunto, 40)}${
    item.ot_vinculada ? ` · ${item.ot_vinculada.codigo}` : ''
  }`;
  return (
    <Link
      to={`/tickets/${item.id}`}
      title={`${item.codigo} ${item.asunto}`}
      aria-label={`${item.codigo} ${item.asunto}`}
      data-barra={item.id}
      data-estado={item.estado}
      data-vencido={item.vencido}
      data-columna-inicio={barra.inicio}
      data-columna-fin={barra.fin}
      data-subfila={barra.subfila}
      style={{
        gridColumn: `${barra.inicio + 2} / ${barra.fin + 3}`,
        gridRow: barra.subfila + 1,
      }}
      className={cn(
        'z-[1] mx-0.5 my-0.5 flex min-h-6 min-w-6 items-center gap-1.5 overflow-hidden rounded-sm px-2 font-mono text-xs whitespace-nowrap',
        item.vencido
          ? 'border border-dashed border-plazo-vencido/40 bg-plazo-vencido-suave text-plazo-vencido'
          : ESTILO_ESTADO[item.estado],
      )}
    >
      <PuntoPrioridad prioridad={item.prioridad} />
      {item.vencido ? <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{texto}</span>
      {sinFecha ? <span className="shrink-0 opacity-80">· sin fecha</span> : null}
    </Link>
  );
}
