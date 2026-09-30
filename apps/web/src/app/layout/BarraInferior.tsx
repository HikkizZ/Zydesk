import { Menu } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { MENU } from './menu';
import { PanelMenuMovil } from './PanelMenuMovil';

const ACCESOS = [
  { ruta: '/mi-dia', etiqueta: 'Mi día' },
  { ruta: '/tickets', etiqueta: 'Tickets' },
  { ruta: '/avisos', etiqueta: 'Avisos' },
  { ruta: '/tickets/nuevo', etiqueta: 'Nuevo' },
].map((a) => ({ ...a, icono: MENU.find((e) => e.ruta === a.ruta)!.icono }));

const claseAcceso = (activo: boolean) =>
  cn(
    'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap text-xs font-medium',
    activo ? 'bg-white/10 text-fondo' : 'text-fondo/80',
  );

export function BarraInferior() {
  const [abierto, setAbierto] = useState(false);
  const { pathname } = useLocation();
  // "Más" está activo cuando la ruta no corresponde a ninguno de los otros cuatro accesos.
  const masActivo = !ACCESOS.some((a) => a.ruta === pathname);
  return (
    <nav
      aria-label="Principal (móvil)"
      className="fixed inset-x-0 bottom-0 z-10 flex bg-tinta lg:hidden"
    >
      {ACCESOS.map(({ ruta, etiqueta, icono: Icono }) => (
        <NavLink key={ruta} to={ruta} end className={({ isActive }) => claseAcceso(isActive)}>
          <Icono size={18} strokeWidth={1.5} aria-hidden="true" />
          {etiqueta}
        </NavLink>
      ))}
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetTrigger className={claseAcceso(masActivo)}>
          <Menu size={18} strokeWidth={1.5} aria-hidden="true" />
          Más
        </SheetTrigger>
        <PanelMenuMovil alElegir={() => setAbierto(false)} />
      </Sheet>
    </nav>
  );
}
