import { ArrowDown, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatares } from '@/components/dominio/Avatares';
import { Codigo } from '@/components/dominio/Codigo';
import { FechaLimite } from '@/components/dominio/FechaLimite';
import { FechaRelativa } from '@/components/dominio/FechaRelativa';
import { PillEstado } from '@/components/dominio/PillEstado';
import { PillPrioridad } from '@/components/dominio/PillPrioridad';
import { PillTipo } from '@/components/dominio/PillTipo';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ConsultaTickets, TicketResumenDatos } from '@/features/tickets/api';
import { cn } from '@/lib/utils';
import type { GrupoTickets } from './agrupar';

type Orden = NonNullable<ConsultaTickets['orden']>;

const COLUMNAS = 8;

function CabeceraOrdenable({
  etiqueta,
  valor,
  actual,
  onOrden,
}: {
  etiqueta: string;
  valor: Orden;
  actual: Orden;
  onOrden: (orden: Orden) => void;
}) {
  const activo = actual === valor;
  return (
    <TableHead aria-sort={activo ? (valor.startsWith('-') ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        onClick={() => onOrden(valor)}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-medium hover:bg-superficie-suave focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none lg:min-h-8"
      >
        {etiqueta}
        {activo ? (
          <ArrowDown aria-hidden="true" className="size-3.5" />
        ) : (
          <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

function Fila({ ticket }: { ticket: TicketResumenDatos }) {
  return (
    <TableRow>
      <TableCell className="sticky left-0 z-10 bg-superficie">
        <Link
          to={`/tickets/${ticket.id}`}
          className="inline-flex min-h-11 items-center text-acento underline-offset-2 hover:underline lg:min-h-0"
        >
          <Codigo>{ticket.codigo}</Codigo>
        </Link>
      </TableCell>
      <TableCell className="max-w-[360px] min-w-[240px] whitespace-normal">
        <p className="font-medium">{ticket.asunto}</p>
        <p className="text-sm text-tinta-2">{ticket.cliente?.nombre ?? 'Sin cliente'}</p>
      </TableCell>
      <TableCell>
        <PillEstado estado={ticket.estado} espera_de={ticket.espera_de} />
      </TableCell>
      <TableCell>
        <PillPrioridad prioridad={ticket.prioridad} />
      </TableCell>
      <TableCell>
        {ticket.responsables.length > 0 ? (
          <Avatares personas={ticket.responsables} />
        ) : (
          <span className="text-sm text-alta">Sin asignar</span>
        )}
      </TableCell>
      <TableCell>
        <PillTipo tipo={ticket.tipo} />
      </TableCell>
      <TableCell>
        <FechaLimite
          fecha_limite={ticket.fecha_limite}
          vencido={ticket.vencido}
          vence_hoy={ticket.vence_hoy}
        />
      </TableCell>
      <TableCell className="text-sm text-tinta-2">
        <FechaRelativa fecha={ticket.actualizado_en} />
      </TableCell>
    </TableRow>
  );
}

function CabeceraGrupo({
  grupo,
  colapsado,
  onAlternar,
}: {
  grupo: GrupoTickets;
  colapsado: boolean;
  onAlternar: () => void;
}) {
  const n = grupo.tickets.length;
  const Icono = colapsado ? ChevronRight : ChevronDown;
  return (
    <TableRow className="bg-superficie-suave hover:bg-superficie-suave">
      <TableCell colSpan={COLUMNAS} className="p-0">
        <div className="sticky left-0 w-fit">
          <button
            type="button"
            aria-expanded={!colapsado}
            onClick={onAlternar}
            className="flex min-h-11 items-center gap-2 px-3 font-semibold focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none lg:min-h-9"
          >
            <Icono aria-hidden="true" className="size-4" />
            {grupo.punto ? (
              <span aria-hidden="true" className={cn('size-2.5 rounded-full', grupo.punto)} />
            ) : null}
            {grupo.titulo}{' '}
            <span className="font-normal text-tinta-2">
              {n} {n === 1 ? 'ticket' : 'tickets'}
            </span>
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// Tabla de tickets con grupos colapsables. Bajo 1024 px se desplaza a lo ancho con el ID fijo.
export function TablaTickets({
  grupos,
  orden,
  onOrden,
}: {
  grupos: GrupoTickets[];
  orden: Orden;
  onOrden: (orden: Orden) => void;
}) {
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const alternar = (clave: string) =>
    setColapsados((actuales) => {
      const nuevos = new Set(actuales);
      if (!nuevos.delete(clave)) nuevos.add(clave);
      return nuevos;
    });

  return (
    <div className="w-0 min-w-full rounded-lg border border-borde bg-superficie">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky left-0 z-10 bg-superficie">ID</TableHead>
            <TableHead>Asunto</TableHead>
            <TableHead>Estado</TableHead>
            <CabeceraOrdenable
              etiqueta="Prioridad"
              valor="prioridad"
              actual={orden}
              onOrden={onOrden}
            />
            <TableHead>Responsables</TableHead>
            <TableHead>Tipo</TableHead>
            <CabeceraOrdenable
              etiqueta="Vence"
              valor="fecha_limite"
              actual={orden}
              onOrden={onOrden}
            />
            <CabeceraOrdenable
              etiqueta="Actualizado"
              valor="-actualizado_en"
              actual={orden}
              onOrden={onOrden}
            />
          </TableRow>
        </TableHeader>
        {grupos.map((g) => {
          const colapsado = colapsados.has(g.clave);
          return (
            <TableBody key={g.clave}>
              {g.titulo !== null ? (
                <CabeceraGrupo
                  grupo={g}
                  colapsado={colapsado}
                  onAlternar={() => alternar(g.clave)}
                />
              ) : null}
              {colapsado ? null : g.tickets.map((t) => <Fila key={t.id} ticket={t} />)}
            </TableBody>
          );
        })}
      </Table>
    </div>
  );
}
