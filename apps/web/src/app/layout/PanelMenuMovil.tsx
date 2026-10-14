import { useQueryClient } from '@tanstack/react-query';
import { ETIQUETA_ROL } from '@zydesk/shared';
import { CircleHelp } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router';
import { Avatar } from '@/components/dominio/Avatar';
import { Button } from '@/components/ui/button';
import { SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { salir } from '@/features/auth/api';
import { useYo } from '@/features/auth/SesionProvider';
import { cn } from '@/lib/utils';
import { MENU, visible } from './menu';

const GRUPOS = ['Tickets', 'Trabajo', 'Administración'] as const;

const claseItem = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium',
    isActive
      ? 'bg-acento-suave text-acento before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-acento'
      : 'text-tinta-2 hover:bg-panel-hundido hover:text-tinta',
  );

// Contenido del panel "Más": se monta dentro de <Sheet> en BarraInferior.
export function PanelMenuMovil({ alElegir }: { alElegir: () => void }) {
  const yo = useYo();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function cerrarSesion() {
    try {
      await salir();
    } finally {
      queryClient.clear();
      queryClient.setQueryData(['yo'], null);
      void navigate('/ingresar', { replace: true });
    }
  }

  return (
    <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto bg-panel">
      <SheetHeader>
        <SheetTitle className="text-sm font-semibold">Menú</SheetTitle>
      </SheetHeader>
      <div className="flex flex-col gap-1 px-4 pb-4">
        <NavLink to="/perfil" end className={claseItem} onClick={alElegir}>
          <Avatar iniciales={yo.iniciales} color={yo.color_avatar} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-tinta">{yo.nombre}</span>
            <span className="truncate text-xs font-normal text-tinta-3">
              {ETIQUETA_ROL[yo.rol]}
            </span>
          </span>
        </NavLink>
        {GRUPOS.map((grupo) => (
          <div key={grupo} className="mt-3 flex flex-col gap-1">
            <div
              aria-hidden="true"
              className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-tinta-3"
            >
              {grupo}
            </div>
            {MENU.filter((e) => e.grupo === grupo && visible(yo.rol, e)).map(
              ({ ruta, etiqueta, icono: Icono }) => (
                <NavLink key={ruta} to={ruta} end className={claseItem} onClick={alElegir}>
                  <Icono size={18} strokeWidth={1.5} aria-hidden="true" />
                  {etiqueta}
                </NavLink>
              ),
            )}
          </div>
        ))}
        <NavLink to="/ayuda" className={(s) => cn(claseItem(s), 'mt-3')} onClick={alElegir}>
          <CircleHelp size={18} strokeWidth={1.5} aria-hidden="true" />
          Ayuda
        </NavLink>
        <Button variant="outline" className="mt-4 w-full" onClick={() => void cerrarSesion()}>
          Cerrar sesión
        </Button>
      </div>
    </SheetContent>
  );
}
