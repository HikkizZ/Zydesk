import type { TicketResumenDatos } from '@/features/tickets/api';
import { cn } from '@/lib/utils';
import type { ClaveColumna } from './columnas';
import { TarjetaTicket } from './TarjetaTicket';

export function Columna({
  clave,
  titulo,
  subtitulo,
  punto,
  tickets,
}: {
  clave: ClaveColumna;
  titulo: string;
  subtitulo?: string | undefined;
  punto: string;
  tickets: TicketResumenDatos[];
}) {
  return (
    <section
      aria-labelledby={`columna-${clave}`}
      className="flex min-w-[260px] flex-1 snap-start flex-col gap-2 rounded-md border border-linea bg-lienzo p-2"
    >
      <header className="px-1 pt-1">
        <h2
          id={`columna-${clave}`}
          className="flex items-center gap-2 text-tabla font-medium text-tinta"
        >
          <span aria-hidden="true" className={cn('size-1.5 rounded-full', punto)} />
          {titulo}
          <span className="rounded-sm border border-linea bg-panel px-1.5 text-xs font-medium text-tinta-2 tabular-nums">
            {tickets.length}
          </span>
        </h2>
        {subtitulo ? <p className="mt-0.5 text-xs text-tinta-2">{subtitulo}</p> : null}
      </header>
      {tickets.length === 0 ? (
        <p className="rounded-md border border-dashed border-linea-campo px-3 py-6 text-center text-sm text-tinta-3">
          Sin tickets
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <TarjetaTicket ticket={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
