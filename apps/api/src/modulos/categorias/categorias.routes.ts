import { Router } from 'express';
import { z } from 'zod';
import { CategoriaEntrada, CategoriaSalida, CategoriasQuery } from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import {
  cambiarActivoCategoria,
  crearCategoria,
  editarCategoria,
  listarCategorias,
} from './categorias.service.js';

const paramsId = z.object({ id: z.coerce.number().int().positive() });

export function crearRutasCategorias(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/categorias',
    resumen: 'Listar categorías',
    etiqueta: 'Categorías',
    permiso: 'sesion',
    query: CategoriasQuery,
    respuesta: z.array(CategoriaSalida),
    handler: async ({ query }) => listarCategorias(query),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/categorias',
    resumen: 'Crear una categoría',
    etiqueta: 'Categorías',
    permiso: 'config.editar',
    body: CategoriaEntrada,
    respuesta: CategoriaSalida,
    status: 201,
    handler: async ({ actor, body }) => crearCategoria(actorRequerido(actor), body),
  });

  ruta(router, {
    metodo: 'put',
    path: '/api/categorias/:id',
    resumen: 'Reemplazar una categoría',
    etiqueta: 'Categorías',
    permiso: 'config.editar',
    params: paramsId,
    body: CategoriaEntrada,
    respuesta: CategoriaSalida,
    handler: async ({ actor, params, body }) =>
      editarCategoria(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/categorias/:id/desactivar',
    resumen: 'Desactivar una categoría',
    etiqueta: 'Categorías',
    permiso: 'config.editar',
    params: paramsId,
    respuesta: CategoriaSalida,
    handler: async ({ actor, params }) =>
      cambiarActivoCategoria(actorRequerido(actor), params.id, false),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/categorias/:id/reactivar',
    resumen: 'Reactivar una categoría',
    etiqueta: 'Categorías',
    permiso: 'config.editar',
    params: paramsId,
    respuesta: CategoriaSalida,
    handler: async ({ actor, params }) =>
      cambiarActivoCategoria(actorRequerido(actor), params.id, true),
  });

  return router;
}
