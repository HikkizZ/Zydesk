import { ETIQUETA_ROL } from '@zydesk/shared';
import { CircleHelp } from 'lucide-react';
import { NavLink } from 'react-router';
import { Avatar } from '@/components/dominio/Avatar';
import { useYo } from '@/features/auth/SesionProvider';
import { InsigniaAvisos } from '@/features/avisos/components/InsigniaAvisos';
import { cn } from '@/lib/utils';
import { MENU, visible, type EntradaMenu } from './menu';

const GRUPOS = ['Tickets', 'Trabajo', 'Administración'] as const;

const claseItem = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium',
    isActive
      ? 'bg-acento-suave text-acento before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-acento'
      : 'text-tinta-2 hover:bg-panel-hundido hover:text-tinta',
  );

function Item({ entrada }: { entrada: EntradaMenu }) {
  const Icono = entrada.icono;
  return (
    <NavLink to={entrada.ruta} end className={claseItem}>
      <Icono size={18} strokeWidth={1.5} aria-hidden="true" />
      {entrada.etiqueta}
      {entrada.ruta === '/avisos' ? <InsigniaAvisos className="ml-auto" /> : null}
    </NavLink>
  );
}

const nuevo = MENU.find((e) => e.ruta === '/tickets/nuevo')!;
const principales = MENU.filter(
  (e) => !e.grupo && e.ruta !== '/tickets/nuevo' && e.ruta !== '/perfil',
);

export function MenuLateral() {
  const yo = useYo();
  const NuevoIcono = nuevo.icono;
  const esVisible = (e: EntradaMenu) => visible(yo.rol, e);
  return (
    <nav
      aria-label="Principal"
      className="hidden border-r border-linea bg-lienzo text-tinta-2 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-0.5 lg:overflow-y-auto lg:p-3"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 px-2.5 text-base font-semibold text-tinta">
        {yo.logo_url ? <img src={yo.logo_url} alt="" className="h-6 w-auto" /> : null}
        {yo.nombre_app}
      </div>
      <NavLink
        to={nuevo.ruta}
        end
        className="mb-4 flex h-8 w-full items-center justify-start gap-2.5 rounded-md bg-acento px-2.5 text-sm font-medium text-white hover:bg-acento/90"
      >
        <NuevoIcono size={18} strokeWidth={1.5} aria-hidden="true" />
        {nuevo.etiqueta}
      </NavLink>
      {principales.filter(esVisible).map((e) => (
        <Item key={e.ruta} entrada={e} />
      ))}
      {GRUPOS.map((grupo) => (
        <div key={grupo} className="flex flex-col gap-0.5">
          <div
            aria-hidden="true"
            className="px-2.5 pb-1.5 pt-5 text-[11px] font-medium uppercase tracking-[0.08em] text-tinta-3"
          >
            {grupo}
          </div>
          {MENU.filter((e) => e.grupo === grupo && esVisible(e)).map((e) => (
            <Item key={e.ruta} entrada={e} />
          ))}
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-linea pt-3">
        <NavLink to="/ayuda" className={claseItem}>
          <CircleHelp size={18} strokeWidth={1.5} aria-hidden="true" />
          Ayuda
        </NavLink>
        <NavLink to="/perfil" className={(s) => cn(claseItem(s), 'h-auto py-1.5')}>
          <Avatar iniciales={yo.iniciales} color={yo.color_avatar} className="size-7" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-tinta">{yo.nombre}</span>
            <span className="truncate text-xs font-normal text-tinta-3">
              {ETIQUETA_ROL[yo.rol]}
            </span>
          </span>
        </NavLink>
      </div>
    </nav>
  );
}
