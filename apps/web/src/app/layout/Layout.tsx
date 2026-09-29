import { Outlet } from 'react-router';
import { BarraInferior } from './BarraInferior';
import { MenuLateral } from './MenuLateral';

export function Layout() {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <MenuLateral />
      <main className="p-6 pb-24 lg:pb-6">
        <Outlet />
      </main>
      <BarraInferior />
    </div>
  );
}
