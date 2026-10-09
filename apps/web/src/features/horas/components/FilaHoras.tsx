import { Link } from 'react-router';
import { Codigo } from '@/components/dominio/Codigo';
import { Chip } from '@/components/dominio/Chip';
import { PillEtapaOt } from '@/components/dominio/PillEtapaOt';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatearHoras } from '@/lib/formato';
import { cn } from '@/lib/utils';
import type { DiaDatos, FilaDatos } from '../api';
import type { AccionesHoras } from '../useAccionesHoras';
import { esOtFinal, etiquetaDia, nombreFila } from '../utiles';
import { CeldaHoras } from './CeldaHoras';

const MOTIVO_OT_CERRADA = 'La OT está cerrada: no se registran horas';
const MOTIVO_FUTURO = 'No se registran horas a futuro';

// Quién es la fila: código (enlace) + título + tipo + tarea; "Sin ticket" muestra su descripción.
export function InfoFila({ fila }: { fila: FilaDatos }) {
  const { destino, tarea } = fila;
  if (destino.tipo === 'sin_ticket') {
    return (
      <div className="min-w-0">
        <p className="text-sm font-medium text-tinta-2">Sin ticket</p>
        <p className="truncate text-sm italic" title={destino.descripcion}>
          {destino.descripcion}
        </p>
      </div>
    );
  }
  const enlace = destino.tipo === 'ot' ? `/ots/${destino.id}` : `/tickets/${destino.id}`;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link to={enlace} className="text-acento underline underline-offset-2">
          <Codigo>{destino.codigo}</Codigo>
        </Link>
        {fila.facturable ? (
          <Chip tono="acento">Facturable</Chip>
        ) : (
          <Chip tono="suave-atento">Interna</Chip>
        )}
        {destino.tipo === 'ot' && destino.final ? <PillEtapaOt etapa={destino.etapa} /> : null}
        {destino.tipo === 'ticket' && destino.cerrado ? <Chip tono="neutro">Cerrado</Chip> : null}
        {tarea ? <span className="text-xs text-tinta-2">· {tarea.titulo}</span> : null}
      </div>
      <p className="truncate text-sm" title={destino.titulo}>
        {destino.titulo}
      </p>
    </div>
  );
}

export interface PropsCeldaDeFila {
  fila: FilaDatos;
  indice: number;
  dia: DiaDatos;
  /** La planilla es de la sesión y puede editarse. */
  editable: boolean;
  acciones: AccionesHoras;
  onDetalle: (clave: string, indice: number) => void;
  className?: string | undefined;
}

export function CeldaDeFila({
  fila,
  indice,
  dia,
  editable,
  acciones,
  onDetalle,
  className,
}: PropsCeldaDeFila) {
  const celda = fila.celdas[indice];
  if (!celda) return null;
  const final = esOtFinal(fila.destino);
  return (
    <CeldaHoras
      celda={celda}
      etiqueta={`${nombreFila(fila)} · ${etiquetaDia(dia, indice)}`}
      editable={editable && !final}
      deshabilitada={dia.futuro}
      motivo={final ? MOTIVO_OT_CERRADA : dia.futuro ? MOTIVO_FUTURO : undefined}
      onGuardar={(horas) => acciones.guardarCelda(fila, celda, horas)}
      onAlternarFueraDeHorario={(fuera) => acciones.alternarFuera(celda, fuera)}
      onAbrirDetalle={() => onDetalle(fila.clave, indice)}
      className={className}
    />
  );
}

export function FilaCuadricula({
  fila,
  dias,
  editable,
  acciones,
  onDetalle,
}: {
  fila: FilaDatos;
  dias: DiaDatos[];
  editable: boolean;
  acciones: AccionesHoras;
  onDetalle: (clave: string, indice: number) => void;
}) {
  return (
    <TableRow data-fila={fila.clave}>
      <TableCell className="sticky left-0 z-10 w-60 min-w-60 bg-panel whitespace-normal">
        <InfoFila fila={fila} />
      </TableCell>
      {dias.map((dia, i) => (
        <TableCell
          key={dia.fecha}
          data-hoy={dia.hoy || undefined}
          className={cn('w-18 min-w-18 px-1', dia.futuro && 'bg-panel-hundido/60 opacity-60')}
        >
          <CeldaDeFila
            fila={fila}
            indice={i}
            dia={dia}
            editable={editable}
            acciones={acciones}
            onDetalle={onDetalle}
          />
        </TableCell>
      ))}
      <TableCell className="text-right font-mono font-medium tabular-nums">
        {formatearHoras(fila.total)}
      </TableCell>
    </TableRow>
  );
}

// Vista por día (< 768 px): una tarjeta por fila con el campo de horas del día elegido.
export function TarjetaFila({
  fila,
  indice,
  dia,
  editable,
  acciones,
  onDetalle,
}: Omit<PropsCeldaDeFila, 'className'>) {
  return (
    <li
      data-fila={fila.clave}
      data-hoy={dia.hoy || undefined}
      className="space-y-2 rounded-md border border-linea bg-panel p-3"
    >
      <InfoFila fila={fila} />
      <CeldaDeFila
        fila={fila}
        indice={indice}
        dia={dia}
        editable={editable}
        acciones={acciones}
        onDetalle={onDetalle}
      />
    </li>
  );
}
