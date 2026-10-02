import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { InsigniaAvisos } from '@/features/avisos/components/InsigniaAvisos';
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
    'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap text-xs font-medium',
    activo ? 'bg-white/10 text-fondo' : 'text-fondo/80',
  );

// "Tickets" cubre todo lo que cuelga de /tickets (tablero, tabla, línea de tiempo…), salvo "Nuevo".
function esActivo(ruta: string, pathname: string): boolean {
  if (ruta !== '/tickets') return pathname === ruta;
  return (pathname === ruta || pathname.startsWith(`${ruta}/`)) && pathname !== '/tickets/nuevo';
}

export function BarraInferior() {
  const [abierto, setAbierto] = useState(false);
  const { pathname } = useLocation();
  // "Más" está activo cuando la ruta no corresponde a ninguno de los otros cuatro accesos.
  const masActivo = !ACCESOS.some((a) => esActivo(a.ruta, pathname));
  return (
    <nav
      aria-label="Principal (móvil)"
      className="fixed inset-x-0 bottom-0 z-10 flex bg-tinta lg:hidden"
    >
      {ACCESOS.map(({ ruta, etiqueta, icono: Icono }) => {
        const activo = esActivo(ruta, pathname);
        return (
          <Link
            key={ruta}
            to={ruta}
            aria-current={activo ? 'page' : undefined}
            className={claseAcceso(activo)}
          >
            <Icono size={18} strokeWidth={1.5} aria-hidden="true" />
            {etiqueta}
            {ruta === '/avisos' ? (
              <InsigniaAvisos className="absolute right-1/4 top-1.5 min-w-4 px-1 text-[10px] leading-4" />
            ) : null}
          </Link>
        );
      })}
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
