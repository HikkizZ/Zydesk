import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { Salud } from '@/features/salud/api';
import { obtener } from '@/lib/api';

// Pie global: dentro de <main> al final y también en la pantalla de ingreso.
export function Pie({ nombreApp, className }: { nombreApp: string; className?: string }) {
  // Versión en ejecución (Fase 9, §18.13): una sola consulta; si falla, no se muestra.
  const { data } = useQuery({
    queryKey: ['salud', 'version'],
    queryFn: () => obtener<Salud>('/api/salud'),
    staleTime: Infinity,
    retry: false,
  });
  return (
    <footer className={`mt-10 text-sm text-tinta-2 ${className ?? ''}`}>
      {nombreApp} ·{' '}
      <Link
        to="/terminos"
        className="inline-flex min-h-11 items-center underline underline-offset-2 lg:min-h-0"
      >
        Términos de uso
      </Link>{' '}
      ·{' '}
      <Link
        to="/privacidad"
        className="inline-flex min-h-11 items-center underline underline-offset-2 lg:min-h-0"
      >
        Privacidad
      </Link>
      {data?.version ? (
        <>
          {' '}
          ·{' '}
          <span data-letra="insignia" className="text-xs">
            v{data.version}
          </span>
        </>
      ) : null}
    </footer>
  );
}
