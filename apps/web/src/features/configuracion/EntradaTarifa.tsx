import type { Moneda } from '@zydesk/shared';
import { Input } from '@/components/ui/input';
import { Seleccion } from './Seleccion';

// Moneda (CLP / UF) + valor de una tarifa. Cambiar la moneda no convierte el número escrito (spec fase 8b §8.2).
export function EntradaTarifa({
  id,
  etiqueta,
  moneda,
  texto,
  alCambiarMoneda,
  alCambiarTexto,
  disabled,
  invalido,
  describedby,
}: {
  id: string;
  etiqueta: string;
  moneda: Moneda;
  texto: string;
  alCambiarMoneda: (m: Moneda) => void;
  alCambiarTexto: (t: string) => void;
  disabled?: boolean;
  invalido?: boolean;
  describedby?: string | undefined;
}) {
  return (
    <div className="grid max-w-md gap-2 sm:grid-cols-[auto_1fr]">
      <Seleccion
        etiqueta={`Moneda de ${etiqueta}`}
        valor={moneda}
        alCambiar={(v) => alCambiarMoneda(v as Moneda)}
        opciones={(['CLP', 'UF'] as const).map((m) => ({
          valor: m,
          etiqueta: m === 'CLP' ? '$ pesos' : 'UF',
        }))}
        className="sm:w-32"
        {...(disabled === undefined ? {} : { disabled })}
      />
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="text-tinta-2">
          {moneda === 'UF' ? 'UF' : '$'}
        </span>
        <Input
          id={id}
          type="number"
          min={0}
          step={moneda === 'UF' ? 0.01 : 1}
          inputMode={moneda === 'UF' ? 'decimal' : 'numeric'}
          placeholder="[TARIFA]"
          className="min-w-0 font-mono"
          value={texto}
          onChange={(e) => alCambiarTexto(e.target.value)}
          aria-invalid={invalido}
          aria-describedby={describedby}
          {...(disabled === undefined ? {} : { disabled })}
        />
      </div>
    </div>
  );
}
