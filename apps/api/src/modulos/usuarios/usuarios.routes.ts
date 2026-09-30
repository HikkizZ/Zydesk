import { Router } from 'express';
import { z } from 'zod';
import {
  RestablecerSalida,
  UsuarioCrearEntrada,
  UsuarioEditarEntrada,
  UsuarioSalida,
  UsuariosQuery,
} from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import {
  crearUsuario,
  desactivarUsuario,
  editarUsuario,
  listarUsuarios,
  obtenerUsuario,
  reactivarUsuario,
  restablecerContrasena,
} from './usuarios.service.js';

const paramsId = z.object({ id: z.coerce.number().int().positive() });

export function crearRutasUsuarios(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/usuarios',
    resumen: 'Listar usuarios',
    etiqueta: 'Usuarios',
    permiso: 'sesion',
    query: UsuariosQuery,
    respuesta: z.array(UsuarioSalida),
    handler: async ({ query }) => listarUsuarios(query),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/usuarios/:id',
    resumen: 'Obtener un usuario',
    etiqueta: 'Usuarios',
    permiso: 'sesion',
    params: paramsId,
    respuesta: UsuarioSalida,
    handler: async ({ params }) => obtenerUsuario(params.id),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/usuarios',
    resumen: 'Crear un usuario con contraseña temporal',
    etiqueta: 'Usuarios',
    permiso: 'config.editar',
    body: UsuarioCrearEntrada,
    respuesta: UsuarioSalida,
    status: 201,
    handler: async ({ actor, body }) => crearUsuario(actorRequerido(actor), body),
  });

  ruta(router, {
    metodo: 'patch',
    path: '/api/usuarios/:id',
    resumen: 'Editar un usuario',
    etiqueta: 'Usuarios',
    permiso: 'config.editar',
    params: paramsId,
    body: UsuarioEditarEntrada,
    respuesta: UsuarioSalida,
    handler: async ({ actor, params, body }) =>
      editarUsuario(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/usuarios/:id/desactivar',
    resumen: 'Desactivar un usuario y cerrar sus sesiones',
    etiqueta: 'Usuarios',
    permiso: 'config.editar',
    params: paramsId,
    respuesta: UsuarioSalida,
    handler: async ({ actor, params }) => desactivarUsuario(actorRequerido(actor), params.id),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/usuarios/:id/reactivar',
    resumen: 'Reactivar un usuario',
    etiqueta: 'Usuarios',
    permiso: 'config.editar',
    params: paramsId,
    respuesta: UsuarioSalida,
    handler: async ({ actor, params }) => reactivarUsuario(actorRequerido(actor), params.id),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/usuarios/:id/restablecer-contrasena',
    resumen: 'Restablecer la contraseña (devuelve una temporal una sola vez)',
    etiqueta: 'Usuarios',
    permiso: 'config.editar',
    params: paramsId,
    respuesta: RestablecerSalida,
    handler: async ({ actor, params }) => restablecerContrasena(actorRequerido(actor), params.id),
  });

  return router;
}
