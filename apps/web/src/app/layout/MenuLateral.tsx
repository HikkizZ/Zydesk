import { ETIQUETA_ROL } from '@zydesk/shared';
import { NavLink } from 'react-router';
import { Avatar } from '@/components/dominio/Avatar';
import { useYo } from '@/features/auth/SesionProvider';
import { InsigniaAvisos } from '@/features/avisos/components/InsigniaAvisos';
import { cn } from '@/lib/utils';
import { MENU, visible, type EntradaMenu } from './menu';

const GRUPOS = ['Tickets', 'Trabajo', 'Administración'] as const;

const claseItem = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-white/5',
    isActive ? 'bg-white/10 text-fondo' : 'text-fondo/80',
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
      className="hidden bg-tinta text-fondo/80 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-1 lg:overflow-y-auto lg:p-4"
    >
      <div className="flex items-center gap-2 px-3 pb-4 pt-2 font-titulo text-xl font-bold text-fondo">
        {yo.logo_url ? <img src={yo.logo_url} alt="" className="h-6 w-auto" /> : null}
        {yo.nombre_app}
      </div>
      <NavLink
        to={nuevo.ruta}
        end
        className="mb-2 flex min-h-10 items-center gap-3 rounded-md bg-acento px-3 text-sm font-medium text-white"
      >
        <NuevoIcono size={18} strokeWidth={1.5} aria-hidden="true" />
        {nuevo.etiqueta}
      </NavLink>
      {principales.filter(esVisible).map((e) => (
        <Item key={e.ruta} entrada={e} />
      ))}
      {GRUPOS.map((grupo) => (
        <div key={grupo} className="mt-4 flex flex-col gap-1">
          <div className="px-3 pb-1 text-xs uppercase tracking-wide text-fondo/50">{grupo}</div>
          {MENU.filter((e) => e.grupo === grupo && esVisible(e)).map((e) => (
            <Item key={e.ruta} entrada={e} />
          ))}
        </div>
      ))}
      <NavLink to="/perfil" className={(s) => cn(claseItem(s), 'mt-auto py-2')}>
        <Avatar iniciales={yo.iniciales} color={yo.color_avatar} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">{yo.nombre}</span>
          <span className="truncate text-xs text-fondo/60">{ETIQUETA_ROL[yo.rol]}</span>
        </span>
      </NavLink>
    </nav>
  );
}
