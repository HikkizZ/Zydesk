import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { YoSalidaDatos } from '@zydesk/shared';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { SesionContext } from '@/features/auth/SesionProvider';
import { PERMISOS_POR_ROL } from '@zydesk/shared';

// Ayudas de prueba: un `yo` de ejemplo y un envoltorio con router, TanStack Query y sesión fija.
export function yoDePrueba(cambios: Partial<YoSalidaDatos> = {}): YoSalidaDatos {
  const rol = cambios.rol ?? 'tecnico';
  return {
    id: 1,
    nombre: 'Diego Muñoz',
    correo: 'dmunoz@zydesk.local',
    rol,
    departamento: { id: 1, nombre: 'Terreno' },
    color_avatar: '#CFDDF3',
    iniciales: 'DM',
    permisos: [...PERMISOS_POR_ROL[rol]],
    debe_cambiar_contrasena: false,
    debe_aceptar_terminos: false,
    terminos_version_vigente: 'v1',
    nombre_app: 'Zydesk',
    logo_url: null,
    ...cambios,
  };
}

export function ConSesion({
  yo,
  ruta = '/',
  cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  children,
}: {
  yo: YoSalidaDatos | null;
  ruta?: string;
  cliente?: QueryClient;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={cliente}>
      <SesionContext.Provider value={{ yo, cargando: false, recargar: async () => {} }}>
        <MemoryRouter initialEntries={[ruta]}>{children}</MemoryRouter>
      </SesionContext.Provider>
    </QueryClientProvider>
  );
}
