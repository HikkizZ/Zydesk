import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tienePermiso, type Permiso } from '@zydesk/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { EVENTO_NO_AUTENTICADO } from '@/lib/api';
import { yo as pedirYo, type YoSalidaDatos } from './api';

export interface ValorSesion {
  yo: YoSalidaDatos | null;
  cargando: boolean;
  recargar: () => Promise<void>;
}

export const SesionContext = createContext<ValorSesion | null>(null);

export const RUTAS_PUBLICAS = ['/ingresar', '/terminos', '/privacidad'];

// Solo rutas internas (`/algo`, no `//host`) como destino de `volver`.
export function volverSeguro(volver: string | null | undefined): string | null {
  return volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : null;
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const consulta = useQuery({ queryKey: ['yo'], queryFn: pedirYo, retry: false });

  const recargar = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['yo'] });
  }, [queryClient]);

  // 401 durante la sesión (vencida, cerrada desde otra pestaña): limpia todo y vuelve al ingreso.
  const rutaActual = `${location.pathname}${location.search}`;
  useEffect(() => {
    const alPerderSesion = () => {
      queryClient.clear();
      queryClient.setQueryData(['yo'], null);
      if (!RUTAS_PUBLICAS.includes(window.location.pathname)) {
        void navigate(`/ingresar?volver=${encodeURIComponent(rutaActual)}`, { replace: true });
      }
    };
    window.addEventListener(EVENTO_NO_AUTENTICADO, alPerderSesion);
    return () => window.removeEventListener(EVENTO_NO_AUTENTICADO, alPerderSesion);
  }, [queryClient, navigate, rutaActual]);

  const valor = useMemo<ValorSesion>(
    () => ({ yo: consulta.data ?? null, cargando: consulta.isPending, recargar }),
    [consulta.data, consulta.isPending, recargar],
  );
  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}

// Raíz del router: da el contexto de sesión a todas las rutas, públicas o no.
export function RaizSesion() {
  return (
    <SesionProvider>
      <Outlet />
    </SesionProvider>
  );
}

export function useSesion(): ValorSesion {
  const valor = useContext(SesionContext);
  if (!valor) throw new Error('useSesion fuera de SesionProvider');
  return valor;
}

// Solo dentro de <RequiereSesion>: garantiza que hay sesión.
export function useYo(): YoSalidaDatos {
  const { yo } = useSesion();
  if (!yo) throw new Error('useYo sin sesión');
  return yo;
}

export function usePermiso(permiso: Permiso): boolean {
  const { yo } = useSesion();
  return yo ? tienePermiso(yo.rol, permiso) : false;
}
