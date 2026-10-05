import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { clavesAvisos, noLeidos } from '../api';

// Sondeo de 60 s y al volver a la ventana (ADR 0011). Los dos menús comparten la misma consulta.
export function useNoLeidos(): number {
  const consulta = useQuery({
    queryKey: clavesAvisos.noLeidos,
    queryFn: noLeidos,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  return consulta.data?.no_leidos ?? 0;
}

// Punto rojo con el número junto a "Avisos"; solo el badge, `document.title` no cambia.
export function InsigniaAvisos({ className }: { className?: string }) {
  const n = useNoLeidos();
  if (n <= 0) return null;
  return (
    <span
      data-letra="insignia"
      aria-label={n === 1 ? '1 aviso sin leer' : `${n} avisos sin leer`}
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-urgente-punto px-1.5 text-xs font-semibold leading-5 text-white',
        className,
      )}
    >
      {n >= 100 ? '99+' : n}
    </span>
  );
}
