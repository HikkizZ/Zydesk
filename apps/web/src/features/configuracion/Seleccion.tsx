import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface OpcionSeleccion {
  valor: string;
  etiqueta: string;
}

// `Select` de shadcn con lista de opciones; Radix no admite valores vacíos, use un valor explícito.
export function Seleccion({
  valor,
  alCambiar,
  opciones,
  etiqueta,
  id,
  disabled,
  className,
  invalido,
}: {
  valor: string;
  alCambiar: (valor: string) => void;
  opciones: OpcionSeleccion[];
  etiqueta?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  invalido?: boolean;
}) {
  return (
    <Select
      value={valor}
      onValueChange={alCambiar}
      {...(disabled === undefined ? {} : { disabled })}
    >
      <SelectTrigger
        id={id}
        aria-label={etiqueta}
        aria-invalid={invalido}
        className={cn('w-full', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.etiqueta}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
