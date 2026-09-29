import { NavLink } from 'react-router';
import { Avatar } from '@/components/Avatar';
import { cn } from '@/lib/utils';
import { MENU, type EntradaMenu } from './menu';

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
    </NavLink>
  );
}

const nuevo = MENU.find((e) => e.ruta === '/tickets/nuevo')!;
const principales = MENU.filter(
  (e) => !e.grupo && e.ruta !== '/tickets/nuevo' && e.ruta !== '/perfil',
);

export function MenuLateral() {
  const NuevoIcono = nuevo.icono;
  return (
    <nav
      aria-label="Principal"
      className="hidden bg-tinta text-fondo/80 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-1 lg:overflow-y-auto lg:p-4"
    >
      <div className="px-3 pb-4 pt-2 font-titulo text-xl font-bold text-fondo">Zydesk</div>
      <NavLink
        to={nuevo.ruta}
        end
        className="mb-2 flex min-h-10 items-center gap-3 rounded-md bg-acento px-3 text-sm font-medium text-white"
      >
        <NuevoIcono size={18} strokeWidth={1.5} aria-hidden="true" />
        {nuevo.etiqueta}
      </NavLink>
      {principales.map((e) => (
        <Item key={e.ruta} entrada={e} />
      ))}
      {GRUPOS.map((grupo) => (
        <div key={grupo} className="mt-4 flex flex-col gap-1">
          <div className="px-3 pb-1 text-xs uppercase tracking-wide text-fondo/50">{grupo}</div>
          {MENU.filter((e) => e.grupo === grupo).map((e) => (
            <Item key={e.ruta} entrada={e} />
          ))}
        </div>
      ))}
      <NavLink to="/perfil" className={(s) => cn(claseItem(s), 'mt-auto py-2')}>
        <Avatar iniciales="UE" />
        Usuario de ejemplo
      </NavLink>
    </nav>
  );
}
