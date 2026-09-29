import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { MENU } from './menu';

const ACCESOS = [
  { ruta: '/mi-dia', etiqueta: 'Mi día' },
  { ruta: '/tickets', etiqueta: 'Tickets' },
  { ruta: '/avisos', etiqueta: 'Avisos' },
  { ruta: '/tickets/nuevo', etiqueta: 'Nuevo' },
].map((a) => ({ ...a, icono: MENU.find((e) => e.ruta === a.ruta)!.icono }));

export function BarraInferior() {
  return (
    <nav
      aria-label="Principal (móvil)"
      className="fixed inset-x-0 bottom-0 z-10 flex bg-tinta lg:hidden"
    >
      {ACCESOS.map(({ ruta, etiqueta, icono: Icono }) => (
        <NavLink
          key={ruta}
          to={ruta}
          end
          className={({ isActive }) =>
            cn(
              'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium',
              isActive ? 'bg-white/10 text-fondo' : 'text-fondo/80',
            )
          }
        >
          <Icono size={18} strokeWidth={1.5} aria-hidden="true" />
          {etiqueta}
        </NavLink>
      ))}
    </nav>
  );
}
