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
      className="flex min-w-[280px] flex-1 snap-start flex-col gap-3 rounded-lg border border-borde bg-superficie-suave p-3"
    >
      <header>
        <h2 id={`columna-${clave}`} className="flex items-center gap-2 font-semibold">
          <span aria-hidden="true" className={cn('size-2.5 rounded-full', punto)} />
          {titulo}
          <span className="rounded-full bg-superficie px-2 text-sm font-medium text-tinta-2">
            {tickets.length}
          </span>
        </h2>
        {subtitulo ? <p className="mt-0.5 text-xs text-tinta-2">{subtitulo}</p> : null}
      </header>
      {tickets.length === 0 ? (
        <p className="rounded-md border border-dashed border-borde-campo px-3 py-6 text-center text-sm text-tinta-2">
          Sin tickets
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
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
