import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';

const VISTAS = [
  { ruta: '/tickets', etiqueta: 'Tablero', end: true },
  { ruta: '/tickets/tabla', etiqueta: 'Tabla', end: true },
  { ruta: '/tickets/linea-de-tiempo', etiqueta: 'Línea de tiempo', end: true },
];

// Navegación entre las tres vistas de tickets: son rutas (NavLink con `aria-current`), no `Tabs`.
export function VistasTickets() {
  return (
    <nav aria-label="Vistas de tickets" className="mb-4 flex gap-6 border-b border-linea-fuerte">
      {VISTAS.map((v) => (
        <NavLink
          key={v.ruta}
          to={v.ruta}
          end={v.end}
          className={({ isActive }) =>
            cn(
              'relative inline-flex min-h-11 items-center text-sm font-medium whitespace-nowrap hover:text-tinta lg:min-h-10',
              isActive
                ? 'text-tinta after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-acento'
                : 'text-tinta-2',
            )
          }
        >
          {v.etiqueta}
        </NavLink>
      ))}
    </nav>
  );
}
