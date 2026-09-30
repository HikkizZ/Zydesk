import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { SelectorPersonas } from '@/components/dominio/SelectorPersonas';

export interface ValorResponsables {
  principal_id: number | null;
  otros_ids: number[];
}

// Principal (uno) + Otros responsables (varios, sin el principal). Sin principal no hay otros.
export function SelectorResponsables({
  valor,
  onChange,
  propuesto,
  disabled,
}: {
  valor: ValorResponsables;
  onChange: (valor: ValorResponsables) => void;
  /** Texto bajo "Principal", p. ej. "Propuesto por la categoría". */
  propuesto?: string | null;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-principal`}>Principal</Label>
        <SelectorPersonas
          id={`${id}-principal`}
          etiqueta="Principal"
          valor={valor.principal_id}
          {...(disabled === undefined ? {} : { disabled })}
          onChange={(principal_id) =>
            onChange({
              principal_id,
              otros_ids:
                principal_id === null ? [] : valor.otros_ids.filter((x) => x !== principal_id),
            })
          }
        />
        {propuesto ? <p className="text-sm text-tinta-2">{propuesto}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-otros`}>Otros responsables</Label>
        <SelectorPersonas
          multiple
          id={`${id}-otros`}
          etiqueta="Otros responsables"
          valor={valor.otros_ids}
          excluir={valor.principal_id === null ? undefined : [valor.principal_id]}
          disabled={disabled === true || valor.principal_id === null}
          onChange={(otros_ids) => onChange({ principal_id: valor.principal_id, otros_ids })}
        />
      </div>
    </div>
  );
}
