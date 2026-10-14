import { Outlet } from 'react-router';
import { useYo } from '@/features/auth/SesionProvider';
import { BarraInferior } from './BarraInferior';
import { BarraSuperior } from './BarraSuperior';
import { MenuLateral } from './MenuLateral';
import { Pie } from './Pie';

export function Layout() {
  const yo = useYo();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <MenuLateral />
      <div className="flex min-h-dvh min-w-0 flex-col">
        <BarraSuperior />
        <main className="flex-1 p-4 lg:p-7">
          <Outlet />
        </main>
        {/* El margen inferior bajo lg (ADR 0029.15) pasa al pie, que ya no está dentro de main. */}
        <Pie
          nombreApp={yo.nombre_app}
          className="pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-3"
        />
      </div>
      <BarraInferior />
    </div>
  );
}
