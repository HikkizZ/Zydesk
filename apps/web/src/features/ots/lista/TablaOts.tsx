import { Link } from 'react-router';
import { Avatares } from '@/components/dominio/Avatares';
import { Codigo } from '@/components/dominio/Codigo';
import { diaMesDeFecha } from '@/components/dominio/formato-fecha';
import { PillEtapaOt } from '@/components/dominio/PillEtapaOt';
import { PillFacturacion } from '@/components/dominio/PillFacturacion';
import { PillTipoOt } from '@/components/dominio/PillTipoOt';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OtResumenDatos } from '@/features/ots/api';
import { cn } from '@/lib/utils';

const formatoHoras = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

function Fila({ ot }: { ot: OtResumenDatos }) {
  return (
    <TableRow>
      <TableCell className="sticky left-0 z-10 bg-superficie">
        <Link
          to={`/ots/${ot.id}`}
          className="font-mono text-sm text-acento underline underline-offset-2"
        >
          {ot.codigo}
        </Link>
      </TableCell>
      <TableCell className="max-w-80 min-w-56 whitespace-normal">
        <Link to={`/ots/${ot.id}`} className="font-medium hover:underline">
          {ot.titulo}
        </Link>
        <p className="text-xs text-tinta-2">
          {ot.cliente ? `${ot.cliente.nombre} · ` : ''}
          <Codigo className="text-xs">{ot.ticket.codigo}</Codigo>
        </p>
      </TableCell>
      <TableCell>
        <PillTipoOt tipo={ot.tipo} />
      </TableCell>
      <TableCell>
        <PillEtapaOt etapa={ot.etapa} />
      </TableCell>
      <TableCell className="font-mono text-sm whitespace-nowrap">
        {formatoHoras.format(ot.horas.estimadas)} / {formatoHoras.format(ot.horas.registradas)} h
      </TableCell>
      <TableCell className={cn('whitespace-nowrap', ot.vencida && 'font-semibold text-urgente')}>
        {ot.termino ? diaMesDeFecha(ot.termino) : <span className="text-tinta-3">—</span>}
      </TableCell>
      <TableCell>
        <PillFacturacion estado={ot.estado_facturacion} />
      </TableCell>
      <TableCell>
        {ot.responsable_tecnico ? (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <Avatares personas={[ot.responsable_tecnico]} />
            <span className="text-sm">{ot.responsable_tecnico.nombre}</span>
          </span>
        ) : (
          <span className="text-sm text-tinta-3">Sin asignar</span>
        )}
      </TableCell>
    </TableRow>
  );
}

// Vista de solo lectura (ADR 0022): cada fila enlaza a la OT; las etapas se cambian desde ella.
export function TablaOts({ ots }: { ots: OtResumenDatos[] }) {
  return (
    <div className="rounded-lg border border-borde bg-superficie">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-superficie">OT</TableHead>
            <TableHead>Trabajo</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Etapa</TableHead>
            <TableHead>Horas (est. / reg.)</TableHead>
            <TableHead>Término</TableHead>
            <TableHead>Facturación</TableHead>
            <TableHead>Responsable</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ots.map((ot) => (
            <Fila key={ot.id} ot={ot} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
