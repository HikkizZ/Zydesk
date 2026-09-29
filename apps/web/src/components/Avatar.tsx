import { cn } from '@/lib/utils';

export function Avatar({ iniciales, className }: { iniciales: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-fondo',
        className,
      )}
    >
      {iniciales}
    </span>
  );
}
