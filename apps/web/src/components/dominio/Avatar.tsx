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
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-tinta',
        className,
      )}
    >
      {iniciales}
    </span>
  );
}
