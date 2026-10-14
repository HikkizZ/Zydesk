import { ArrowDown, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatares } from '@/components/dominio/Avatares';
import { Codigo } from '@/components/dominio/Codigo';
import { FranjaPlazo } from '@/components/dominio/FranjaPlazo';
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
  className,
}: {
  etiqueta: string;
  valor: Orden;
  actual: Orden;
  onOrden: (orden: Orden) => void;
  className?: string;
}) {
  const activo = actual === valor;
  return (
    <TableHead
      className={className}
      aria-sort={activo ? (valor.startsWith('-') ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onOrden(valor)}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 hover:text-tinta lg:min-h-8"
      >
        {etiqueta}
        {activo ? (
          <ArrowDown aria-hidden="true" className="size-[11px]" />
        ) : (
          <ArrowUpDown aria-hidden="true" className="size-[11px] opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

function Fila({ ticket }: { ticket: TicketResumenDatos }) {
  return (
    <TableRow>
      <TableCell className="sticky left-0 z-10 bg-panel">
        <Link
          to={`/tickets/${ticket.id}`}
          className="inline-flex min-h-11 items-center text-tinta-2 hover:text-acento lg:min-h-0"
        >
          <Codigo>{ticket.codigo}</Codigo>
        </Link>
      </TableCell>
      <TableCell>
        <div className="max-w-[520px] min-w-[240px]">
          <p className="truncate font-medium text-tinta">{ticket.asunto}</p>
          <p className="truncate text-xs text-tinta-3">{ticket.cliente?.nombre ?? 'Sin cliente'}</p>
        </div>
      </TableCell>
      <TableCell>
        <PillEstado estado={ticket.estado} espera_de={ticket.espera_de} />
      </TableCell>
      <TableCell>
        <PillPrioridad prioridad={ticket.prioridad} />
      </TableCell>
      <TableCell>
        {ticket.responsables.length > 0 ? (
          <span className="inline-flex items-center gap-2">
            <Avatares personas={ticket.responsables} />
            <span aria-hidden="true" className="max-w-[120px] truncate text-xs text-tinta-2">
              {ticket.responsables[0]?.nombre}
            </span>
          </span>
        ) : (
          <span className="text-xs text-plazo-atento">Sin asignar</span>
        )}
      </TableCell>
      <TableCell>
        <PillTipo
          tipo={ticket.tipo}
          {...(ticket.ot_vinculada ? { codigo: ticket.ot_vinculada.codigo } : {})}
        />
      </TableCell>
      <TableCell className="w-[156px]">
        <FranjaPlazo ticket={ticket} />
      </TableCell>
      <TableCell className="w-[96px] text-xs text-tinta-2">
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
    <TableRow className="bg-panel-hundido hover:bg-panel-hundido">
      <TableCell colSpan={COLUMNAS} className="p-0">
        <div className="sticky left-0 w-fit">
          <button
            type="button"
            aria-expanded={!colapsado}
            onClick={onAlternar}
            className="flex min-h-11 items-center gap-2 px-3 text-tabla font-medium text-tinta lg:min-h-9"
          >
            <Icono aria-hidden="true" className="size-4" />
            {grupo.punto ? (
              <span aria-hidden="true" className={cn('size-1.5 rounded-full', grupo.punto)} />
            ) : null}
            {grupo.titulo}{' '}
            <span className="font-normal text-tinta-3">
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
    <div className="w-0 min-w-full">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky left-0 z-10 w-[82px] bg-panel-hundido">Folio</TableHead>
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
              etiqueta="Plazo hábil"
              className="w-[156px]"
              valor="fecha_limite"
              actual={orden}
              onOrden={onOrden}
            />
            <CabeceraOrdenable
              etiqueta="Actualizado"
              className="w-[96px]"
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
