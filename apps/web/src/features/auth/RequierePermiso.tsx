import type { Permiso } from '@zydesk/shared';
import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { SinPermiso } from '@/components/dominio/SinPermiso';
import { usePermiso } from './SesionProvider';

// Guarda por permiso: con `children` envuelve ese contenido; sin ellos, es una ruta de layout (<Outlet />).
export function RequierePermiso({ permiso, children }: { permiso: Permiso; children?: ReactNode }) {
  const permitido = usePermiso(permiso);
  if (!permitido) return <SinPermiso />;
  return children ?? <Outlet />;
}
