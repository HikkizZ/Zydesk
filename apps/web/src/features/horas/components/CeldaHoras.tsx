import { MessageSquare, Moon } from 'lucide-react';
import { useState } from 'react';
import { horasCorto } from '@/lib/formato';
import { cn } from '@/lib/utils';
import type { CeldaDatos } from '../api';
import { interpretarHoras, registroManual, registrosDeSeguimiento } from '../utiles';

interface Props {
  celda: CeldaDatos;
  /** "OT-0218 · Lun 28" */
  etiqueta: string;
  /** Sin edición (planilla ajena, rol lectura, día futuro u OT cerrada) la celda es solo texto. */
  editable: boolean;
  /** Día futuro: se muestra el campo pero no se puede escribir en él. */
  deshabilitada?: boolean | undefined;
  /** Motivo por el que la celda no se edita (tooltip), si lo hay. */
  motivo?: string | undefined;
  /** Guarda el valor al salir del campo: `null` = vaciado. Si rechaza, el valor vuelve al anterior. */
  onGuardar: (horas: number | null) => Promise<void> | void;
  onAlternarFueraDeHorario: (fuera: boolean) => Promise<void> | void;
  onAbrirDetalle: () => void;
  className?: string | undefined;
}

// Celda de la planilla. Con registros nacidos de un seguimiento no hay `input`: el total abre el detalle.
export function CeldaHoras({
  celda,
  etiqueta,
  editable,
  deshabilitada = false,
  motivo,
  onGuardar,
  onAlternarFueraDeHorario,
  onAbrirDetalle,
  className,
}: Props) {
  const manual = registroManual(celda);
  const conSeguimiento = registrosDeSeguimiento(celda).length > 0;
  const valorActual = manual ? String(manual.horas).replace('.', ',') : '';
  const [texto, setTexto] = useState(valorActual);
  const [invalido, setInvalido] = useState(false);

  // Si el valor guardado cambia desde fuera (refresco, rechazo del servidor), el texto lo sigue.
  const [valorPrevio, setValorPrevio] = useState(valorActual);
  if (valorPrevio !== valorActual) {
    setValorPrevio(valorActual);
    setTexto(valorActual);
  }

  if (!editable) {
    return (
      <span
        title={motivo}
        className={cn(
          'block text-right font-mono text-sm',
          !celda.total && 'text-tinta-3',
          className,
        )}
      >
        {horasCorto(celda.total) || '–'}
        {celda.fuera_de_horario ? (
          <Moon aria-label="Fuera de horario" className="ml-1 inline size-3 text-alta" />
        ) : null}
      </span>
    );
  }

  const guardar = async () => {
    const r = interpretarHoras(texto);
    if (!r.ok) {
      setTexto(valorActual);
      setInvalido(true);
      return;
    }
    if (r.valor === (manual ? manual.horas : null)) {
      setTexto(valorActual);
      setInvalido(false);
      return;
    }
    try {
      await onGuardar(r.valor);
      setInvalido(false);
    } catch {
      setTexto(valorActual);
      setInvalido(true);
    }
  };

  return (
    <div className={cn('group/celda relative', className)}>
      {(manual || conSeguimiento) && !deshabilitada ? (
        <button
          type="button"
          aria-label={`Fuera de horario: ${etiqueta}`}
          aria-pressed={celda.fuera_de_horario}
          onClick={() => {
            if (conSeguimiento) onAbrirDetalle();
            else void onAlternarFueraDeHorario(!celda.fuera_de_horario);
          }}
          className={cn(
            'absolute top-1/2 left-1 z-10 -translate-y-1/2 rounded p-0.5 hover:text-tinta focus-visible:opacity-100 group-focus-within/celda:opacity-100 group-hover/celda:opacity-100',
            celda.fuera_de_horario ? 'text-alta opacity-100' : 'text-tinta-3 opacity-0',
          )}
        >
          <Moon aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
      {conSeguimiento ? (
        <button
          type="button"
          aria-label={`${etiqueta}: ${horasCorto(celda.total)} h, ver detalle`}
          onClick={onAbrirDetalle}
          className="inline-flex h-9.5 w-full min-w-0 items-center justify-end gap-1 rounded-md border border-borde-campo bg-superficie pr-2 pl-6 font-mono text-sm"
        >
          <MessageSquare aria-hidden="true" className="size-3 text-tinta-3" />
          {horasCorto(celda.total)}
        </button>
      ) : (
        <input
          type="text"
          inputMode="decimal"
          aria-label={etiqueta}
          disabled={deshabilitada}
          title={motivo}
          aria-invalid={invalido || undefined}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setInvalido(false);
          }}
          onBlur={() => void guardar()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className={cn(
            'h-9.5 w-full min-w-0 rounded-md border bg-superficie pr-2 pl-6 text-right font-mono text-sm outline-none focus-visible:border-acento focus-visible:ring-2 focus-visible:ring-acento/30',
            invalido ? 'border-urgente' : 'border-borde-campo',
          )}
        />
      )}
    </div>
  );
}
