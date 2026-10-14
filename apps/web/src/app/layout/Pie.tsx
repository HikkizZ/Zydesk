import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { Salud } from '@/features/salud/api';
import { obtener } from '@/lib/api';
import { cn } from '@/lib/utils';

const claseEnlace =
  'inline-flex min-h-11 items-center text-tinta-2 underline-offset-2 hover:underline lg:min-h-0';

// Pie global: al final del Layout (fuera de <main>) y también en la pantalla de ingreso.
export function Pie({ nombreApp, className }: { nombreApp: string; className?: string }) {
  // Versión en ejecución (Fase 9, §18.13): una sola consulta; si falla, no se muestra.
  const { data } = useQuery({
    queryKey: ['salud', 'version'],
    queryFn: () => obtener<Salud>('/api/salud'),
    staleTime: Infinity,
    retry: false,
  });
  return (
    <footer
      className={cn(
        'flex flex-wrap items-center gap-x-2 border-t border-linea px-4 py-3 text-xs text-tinta-3 lg:px-7',
        className,
      )}
    >
      <span>{nombreApp}</span>
      <span aria-hidden="true">·</span>
      <Link to="/terminos" className={claseEnlace}>
        Términos de uso
      </Link>
      <span aria-hidden="true">·</span>
      <Link to="/privacidad" className={claseEnlace}>
        Privacidad
      </Link>
      {data?.version ? (
        <span data-letra="insignia" className="ml-auto text-xs">
          v{data.version}
        </span>
      ) : null}
    </footer>
  );
}
