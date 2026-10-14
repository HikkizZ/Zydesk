import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { migasDe } from '../migas';
import { useEstadoBarra } from '../proveedores';

// Barra de 48 px con migas y el slot de la acción principal de la página (§6.3). Sin buscador global.
export function BarraSuperior() {
  const { pathname } = useLocation();
  const { datos, accion } = useEstadoBarra();
  const migas = migasDe(pathname, datos);
  return (
    <header
      aria-label="Ubicación"
      className="flex h-12 shrink-0 items-center gap-4 border-b border-linea bg-panel px-4 lg:px-7"
    >
      <nav aria-label="Migas" className="min-w-0">
        <ol className="flex items-center text-xs text-tinta-3">
          {migas.map((miga, i) => {
            const ultima = i === migas.length - 1;
            // Bajo lg solo los dos últimos niveles.
            const oculta = i < migas.length - 2;
            return (
              <li
                key={`${i}-${miga.etiqueta}`}
                className={cn('min-w-0 items-center', oculta ? 'hidden lg:flex' : 'flex')}
              >
                {i > 0 ? (
                  <ChevronRight
                    className="mx-1.5 size-3 shrink-0 text-tinta-4"
                    aria-hidden="true"
                  />
                ) : null}
                {miga.ruta && !ultima ? (
                  <Link
                    to={miga.ruta}
                    className={cn(
                      'flex min-h-11 min-w-11 items-center hover:text-tinta hover:underline lg:min-h-0 lg:min-w-0',
                      miga.mono && 'font-mono',
                    )}
                  >
                    <span className="truncate">{miga.etiqueta}</span>
                  </Link>
                ) : (
                  <span
                    aria-current={ultima ? 'page' : undefined}
                    className={cn('truncate', ultima && 'text-tinta-2', miga.mono && 'font-mono')}
                  >
                    {miga.etiqueta}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {accion ? <div className="ml-auto hidden items-center gap-2 lg:flex">{accion}</div> : null}
    </header>
  );
}
