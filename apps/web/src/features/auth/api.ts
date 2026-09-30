import type {
  CambiarContrasenaEntradaDatos,
  IngresoEntradaDatos,
  MarcaSalidaDatos,
  SesionSalidaDatos,
  YoSalidaDatos,
} from '@zydesk/shared';
import { enviar, ErrorApi, obtener } from '@/lib/api';

export type { MarcaSalidaDatos, SesionSalidaDatos, YoSalidaDatos };

// `GET /api/yo` sin sesión (401) se devuelve como `null`: no es un error de la pantalla.
export async function yo(): Promise<YoSalidaDatos | null> {
  try {
    return await obtener<YoSalidaDatos>('/api/yo');
  } catch (err) {
    if (err instanceof ErrorApi && err.status === 401) return null;
    throw err;
  }
}

export const marca = () => obtener<MarcaSalidaDatos>('/api/config/marca');

export const ingresar = (
  entrada: Pick<IngresoEntradaDatos, 'correo' | 'contrasena' | 'mantener'>,
) => enviar<YoSalidaDatos>('POST', '/api/auth/ingresar', entrada);

export const salir = () => enviar<void>('POST', '/api/auth/salir');

export const cambiarContrasena = (entrada: CambiarContrasenaEntradaDatos) =>
  enviar<void>('POST', '/api/yo/cambiar-contrasena', entrada);

export const aceptarTerminos = (version: string) =>
  enviar<YoSalidaDatos>('POST', '/api/yo/aceptar-terminos', { version });

export const sesiones = () => obtener<SesionSalidaDatos[]>('/api/yo/sesiones');

export const cerrarSesion = (id: string) => enviar<void>('DELETE', `/api/yo/sesiones/${id}`);

export const cerrarOtras = () => enviar<{ cerradas: number }>('DELETE', '/api/yo/sesiones');
