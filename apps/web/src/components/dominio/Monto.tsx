import { formatearMonto, type Moneda } from '@zydesk/shared';
import { cn } from '@/lib/utils';

// Monto en CLP o UF (ADR 0007): `font-mono`, cifras tabulares y alineado a la derecha.
export function Monto({
  valor,
  moneda = 'CLP',
  className,
}: {
  valor: number;
  moneda?: Moneda;
  className?: string;
}) {
  return (
    <span className={cn('text-right font-mono tabular-nums', className)}>
      {formatearMonto(valor, moneda)}
    </span>
  );
}
