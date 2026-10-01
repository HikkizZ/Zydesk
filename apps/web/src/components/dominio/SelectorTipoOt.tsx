import { ETIQUETA_TIPO_OT, TIPOS_OT, type TipoOt } from '@zydesk/shared';
import { cn } from '@/lib/utils';

const DESCRIPCION: Record<TipoOt, string> = {
  facturable: 'Trabajo para un cliente: se cotiza, se aprueba y se factura.',
  interna: 'Trabajo para el equipo o un área interna: se aprueba y no se factura.',
};

const COLOR: Record<TipoOt, string> = {
  facturable: 'border-resuelto bg-resuelto-fondo/50',
  interna: 'border-interna bg-interna-fondo/50',
};

// Dos tarjetas-radio (diseño "Orden de trabajo"); el tipo solo se cambia en Borrador.
export function SelectorTipoOt({
  valor,
  onChange,
  disabled = false,
  aviso = 'El tipo solo se cambia en Borrador',
}: {
  valor: TipoOt;
  onChange: (tipo: TipoOt) => void;
  disabled?: boolean;
  /** Texto bajo las tarjetas cuando está deshabilitado. */
  aviso?: string | null;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="sr-only">Tipo de OT</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {TIPOS_OT.map((tipo) => (
          <label
            key={tipo}
            className={cn(
              'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3',
              valor === tipo ? cn('border-2', COLOR[tipo]) : 'bg-superficie',
              disabled && 'cursor-not-allowed opacity-70',
            )}
          >
            <input
              type="radio"
              name="tipo-ot"
              value={tipo}
              checked={valor === tipo}
              disabled={disabled}
              onChange={() => onChange(tipo)}
              className="mt-1 size-4 accent-[var(--color-acento)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{ETIQUETA_TIPO_OT[tipo]}</span>
              <span className="text-sm text-tinta-2">{DESCRIPCION[tipo]}</span>
            </span>
          </label>
        ))}
      </div>
      {disabled && aviso ? <p className="text-sm text-tinta-2">{aviso}</p> : null}
    </fieldset>
  );
}
