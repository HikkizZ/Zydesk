import { Navigate, Outlet, useLocation } from 'react-router';
import { Cargando } from '@/components/dominio/Cargando';
import { DialogoTerminos } from '@/features/legal/DialogoTerminos';
import { useSesion } from './SesionProvider';

// Guarda de todas las rutas con sesión (spec §12.2). Orden: contraseña antes que términos, como la API.
export function RequiereSesion() {
  const { yo, cargando } = useSesion();
  const location = useLocation();

  if (cargando) {
    return (
      <div className="p-6">
        <Cargando />
      </div>
    );
  }
  if (!yo) {
    const volver = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/ingresar?volver=${volver}`} replace />;
  }
  if (yo.debe_cambiar_contrasena && location.pathname !== '/cambiar-contrasena') {
    return <Navigate to="/cambiar-contrasena" replace />;
  }
  return (
    <>
      <Outlet />
      {yo.debe_aceptar_terminos && !yo.debe_cambiar_contrasena ? <DialogoTerminos /> : null}
    </>
  );
}
