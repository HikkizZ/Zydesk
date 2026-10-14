import { cn } from '@/lib/utils';

export function Avatar({
  iniciales,
  color,
  className,
}: {
  iniciales: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-linea-suave text-xs font-medium text-tinta-2',
        className,
      )}
    >
      {iniciales}
    </span>
  );
}

// «Sin asignar» no es una alerta: avatar vacío punteado + texto terciario.
export function SinAsignar({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-tabla text-tinta-3', className)}>
      <span
        aria-hidden="true"
        className="inline-flex size-7 shrink-0 rounded-full border border-dashed border-linea-campo"
      />
      Sin asignar
    </span>
  );
}
