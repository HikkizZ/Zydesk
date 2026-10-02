import { cn } from '@/lib/utils';

// Cuadro del resumen: botón que lleva (scroll) a su lista. `urgente` solo si hay algo que atender.
export function TarjetaConteo({
  etiqueta,
  valor,
  urgente = false,
  onClick,
}: {
  etiqueta: string;
  valor: number;
  urgente?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 flex-col items-start gap-1 rounded-lg border border-borde bg-superficie p-4 text-left transition-colors hover:bg-superficie-suave focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="text-sm text-tinta-2">{etiqueta}</span>
      <span
        className={cn(
          'font-titulo text-3xl font-bold tabular-nums',
          urgente && valor > 0 && 'text-urgente',
        )}
      >
        {valor}
      </span>
    </button>
  );
}
