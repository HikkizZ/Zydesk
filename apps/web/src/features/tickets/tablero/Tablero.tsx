import type { TicketResumenDatos } from '@/features/tickets/api';
import { Columna } from './Columna';
import { COLUMNAS, columnaDe } from './columnas';

// Vista Kanban de solo lectura: el estado se cambia desde el detalle del ticket.
export function Tablero({ tickets }: { tickets: TicketResumenDatos[] }) {
  return (
    <div className="-mx-6 flex w-0 min-w-[calc(100%+3rem)] snap-x gap-4 overflow-x-auto px-6 pb-2 lg:mx-0 lg:min-w-full lg:snap-none lg:px-0">
      {COLUMNAS.map((c) => (
        <Columna
          key={c.clave}
          clave={c.clave}
          titulo={c.titulo}
          subtitulo={c.subtitulo}
          punto={c.punto}
          tickets={tickets.filter((t) => columnaDe(t.estado) === c.clave)}
        />
      ))}
    </div>
  );
}
