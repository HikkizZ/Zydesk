import { Outlet } from 'react-router';
import { useYo } from '@/features/auth/SesionProvider';
import { BarraInferior } from './BarraInferior';
import { MenuLateral } from './MenuLateral';
import { Pie } from './Pie';

export function Layout() {
  const yo = useYo();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <MenuLateral />
      <main className="p-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-6">
        <Outlet />
        <Pie nombreApp={yo.nombre_app} />
      </main>
      <BarraInferior />
    </div>
  );
}
