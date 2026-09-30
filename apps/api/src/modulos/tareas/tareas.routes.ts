import { Router } from 'express';
import { z } from 'zod';
import { TareaEditarEntrada, TareaEntrada, TareaSalida } from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import { crearTarea, editarTarea, listarTareas, quitarTarea } from './tareas.service.js';

const paramsId = z.object({ id: z.coerce.number().int().positive() });
const ETIQUETA = 'Tareas';

export function crearRutasTareas(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/tickets/:id/tareas',
    resumen: 'Listar las tareas de un ticket',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    params: paramsId,
    respuesta: z.array(TareaSalida),
    handler: async ({ params }) => listarTareas(params.id),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/tickets/:id/tareas',
    resumen: 'Agregar una tarea a un ticket (no cerrado)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: TareaEntrada,
    respuesta: TareaSalida,
    status: 201,
    handler: async ({ params, body, actor }) => crearTarea(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'patch',
    path: '/api/tareas/:id',
    resumen: 'Editar o marcar una tarea (marcar se permite con el ticket cerrado)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: TareaEditarEntrada,
    respuesta: TareaSalida,
    handler: async ({ params, body, actor }) => editarTarea(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'delete',
    path: '/api/tareas/:id',
    resumen: 'Quitar una tarea de un ticket (no cerrado)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    respuesta: z.void(),
    status: 204,
    handler: async ({ params, actor }) => quitarTarea(actorRequerido(actor), params.id),
  });

  return router;
}
