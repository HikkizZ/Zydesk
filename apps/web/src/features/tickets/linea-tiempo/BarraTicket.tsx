import { ETIQUETA_PRIORIDAD, type EstadoTicket, type Prioridad } from '@zydesk/shared';
import { TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import type { Barra } from './disposicion';

const COLOR_PRIORIDAD: Record<Prioridad, string> = {
  urgente: 'bg-urgente-punto',
  alta: 'bg-alta-punto',
  media: 'bg-media-punto',
  baja: 'bg-baja-punto',
};

// Estado nunca solo por color: relleno lleno, borde punteado y rayado se distinguen también en gris.
const ESTILO_ESTADO: Record<EstadoTicket, string> = {
  en_curso: 'bg-acento text-white',
  nuevo: 'border border-dashed border-tinta-3 bg-superficie text-tinta',
  en_espera:
    'border border-en-espera/30 bg-[repeating-linear-gradient(135deg,var(--color-en-espera-fondo)_0_6px,#efe2c2_6px_12px)] text-en-espera',
  resuelto: 'bg-[#e6e3dc] text-tinta-2',
  descartado: 'bg-[#e6e3dc] text-tinta-2',
  duplicado: 'bg-[#e6e3dc] text-tinta-2',
};

const recortar = (texto: string, max: number) =>
  texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;

// Punto de prioridad compacto (con `aria-label`; el color no es la única señal).
function PuntoPrioridad({ prioridad }: { prioridad: Prioridad }) {
  return (
    <span
      role="img"
      aria-label={`Prioridad ${ETIQUETA_PRIORIDAD[prioridad].toLowerCase()}`}
      className={cn(
        'size-2 shrink-0 rounded-full ring-1 ring-white/70',
        COLOR_PRIORIDAD[prioridad],
      )}
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
        'z-[1] mx-0.5 my-0.5 flex min-h-6 min-w-6 items-center gap-1.5 overflow-hidden rounded-md px-2 text-xs font-medium whitespace-nowrap focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        item.vencido
          ? 'border border-dashed border-urgente-punto bg-urgente-fondo text-urgente'
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
