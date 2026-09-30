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
      <main className="p-6 pb-24 lg:pb-6">
        <Outlet />
        <Pie nombreApp={yo.nombre_app} />
      </main>
      <BarraInferior />
    </div>
  );
}
