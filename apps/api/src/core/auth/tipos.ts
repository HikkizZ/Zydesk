import type { OrigenSesion, Permiso, Rol } from '@zydesk/shared';

export interface UsuarioSesion {
  id: number;
  nombre: string;
  correo: string;
  rol: Rol;
  permisos: readonly Permiso[];
  debe_cambiar_contrasena: boolean;
  debe_aceptar_terminos: boolean;
  sesion_id: string;
  origen: OrigenSesion;
  autenticado_por: 'cookie' | 'bearer';
}

export type PermisoRuta = Permiso | 'sesion' | 'publico';
