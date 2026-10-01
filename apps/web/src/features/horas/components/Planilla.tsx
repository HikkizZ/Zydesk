import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useVistaTarjetas } from '@/features/cotizador/useVistaTarjetas';
import { formatearHoras, horasCorto } from '@/lib/formato';
import { cn } from '@/lib/utils';
import type { DiaDatos, FilaDatos, PlanillaDatos } from '../api';
import type { AccionesHoras } from '../useAccionesHoras';
import { etiquetaDia, inicialDia, tonoDia, type TonoDia } from '../utiles';
import { FilaCuadricula, TarjetaFila } from './FilaHoras';

interface Props {
  planilla: PlanillaDatos;
  /** Filas del servidor más las que la persona agregó en el navegador y aún no tienen horas. */
  filas: FilaDatos[];
  editable: boolean;
  acciones: AccionesHoras;
  onDetalle: (clave: string, indice: number) => void;
}

const CLASE_TONO: Record<TonoDia, string> = {
  urgente: 'bg-urgente-fondo text-urgente',
  alta: 'bg-alta-fondo text-alta',
  neutro: '',
};

/** "7,5 de 8,5 h" (sin jornada: solo "7,5 h"). */
export function textoTotalDia(dia: DiaDatos): string {
  return dia.jornada === null
    ? formatearHoras(dia.total)
    : `${horasCorto(dia.total) || '0'} de ${formatearHoras(dia.jornada)}`;
}

function JornadaDia({ dia }: { dia: DiaDatos }) {
  return (
    <span
      className="block text-xs font-normal text-tinta-3"
      title={dia.feriado ? `Feriado: ${dia.feriado}` : undefined}
    >
      {dia.feriado ? 'Feriado' : dia.jornada === null ? '—' : formatearHoras(dia.jornada)}
    </span>
  );
}

function Cuadricula({ planilla, filas, editable, acciones, onDetalle }: Props) {
  const { dias } = planilla;
  return (
    <div
      data-vista="cuadricula"
      className="overflow-hidden rounded-lg border border-borde bg-superficie"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 w-80 min-w-80 bg-superficie">
              Trabajo
            </TableHead>
            {dias.map((dia, i) => (
              <TableHead
                key={dia.fecha}
                data-hoy={dia.hoy || undefined}
                className={cn(
                  'min-w-18 text-center',
                  dia.hoy && 'text-acento',
                  dia.futuro && 'opacity-60',
                )}
              >
                {etiquetaDia(dia, i)}
                <JornadaDia dia={dia} />
              </TableHead>
            ))}
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((fila) => (
            <FilaCuadricula
              key={fila.clave}
              fila={fila}
              dias={dias}
              editable={editable}
              acciones={acciones}
              onDetalle={onDetalle}
            />
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="sticky left-0 z-10 bg-superficie-suave-2 font-medium">
              Total del día
            </TableCell>
            {dias.map((dia) => (
              <TableCell
                key={dia.fecha}
                data-tono={tonoDia(dia)}
                className={cn(
                  'text-center font-mono text-xs whitespace-nowrap',
                  CLASE_TONO[tonoDia(dia)],
                )}
              >
                {textoTotalDia(dia)}
              </TableCell>
            ))}
            <TableCell className="text-right font-mono text-sm font-semibold">
              {formatearHoras(planilla.totales.semana)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function indiceInicial(dias: DiaDatos[]): number {
  const hoy = dias.findIndex((d) => d.hoy);
  return hoy >= 0 ? hoy : 0;
}

// Bajo 768 px: chips de día con su total y una tarjeta por fila; el total del día va fijo al pie.
function VistaDia({ planilla, filas, editable, acciones, onDetalle }: Props) {
  const { dias } = planilla;
  const [elegido, setElegido] = useState(() => indiceInicial(dias));
  const dia = dias[elegido] ?? dias[0];
  if (!dia) return null;
  return (
    <div data-vista="dia" className="space-y-3">
      <div role="group" aria-label="Día de la semana" className="grid grid-cols-7 gap-1">
        {dias.map((d, i) => (
          <button
            key={d.fecha}
            type="button"
            aria-pressed={i === elegido}
            aria-label={`${etiquetaDia(d, i)}, ${formatearHoras(d.total)}`}
            onClick={() => setElegido(i)}
            className={cn(
              'flex flex-col items-center rounded-md border py-1.5 text-sm',
              i === elegido
                ? 'border-acento bg-acento text-white'
                : 'border-borde-campo bg-superficie',
              d.futuro && i !== elegido && 'opacity-60',
            )}
          >
            <span className="font-semibold">{inicialDia(i)}</span>
            <span className="font-mono text-xs">{horasCorto(d.total) || '·'}</span>
          </button>
        ))}
      </div>
      <p className="text-sm font-medium">
        {etiquetaDia(dia, elegido)}
        {dia.hoy ? ' · hoy' : ''}
        {dia.feriado ? ` · Feriado: ${dia.feriado}` : ''}
      </p>
      <ul className="space-y-2">
        {filas.map((fila) => (
          <TarjetaFila
            key={fila.clave}
            fila={fila}
            indice={elegido}
            dia={dia}
            editable={editable}
            acciones={acciones}
            onDetalle={onDetalle}
          />
        ))}
      </ul>
      <div
        data-tono={tonoDia(dia)}
        className={cn(
          'sticky bottom-14 z-10 flex items-center justify-between rounded-lg border border-borde bg-superficie px-3 py-2 text-sm shadow-sm lg:bottom-0',
          CLASE_TONO[tonoDia(dia)],
        )}
      >
        <span>Total del día</span>
        <span className="font-mono font-semibold">{textoTotalDia(dia)}</span>
      </div>
    </div>
  );
}

export function Planilla(props: Props) {
  const vistaDia = useVistaTarjetas();
  return vistaDia ? <VistaDia {...props} /> : <Cuadricula {...props} />;
}
