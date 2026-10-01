import { Router } from 'express';
import { z } from 'zod';
import {
  HorasQuery,
  PlanillaSemanal,
  RegistroHorasEditar,
  RegistroHorasEntrada,
  RegistroHorasSalida,
} from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import {
  crearRegistro,
  editarRegistro,
  eliminarRegistro,
  obtenerPlanilla,
} from './horas.service.js';

const paramsId = z.object({ id: z.coerce.number().int().positive() });
const ETIQUETA = 'Horas';

export function crearRutasHoras(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/horas',
    resumen: 'Planilla semanal de horas de una persona (la propia o, con horas.ver_todas, otra)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    query: HorasQuery,
    respuesta: PlanillaSemanal,
    handler: async ({ query, actor }) => obtenerPlanilla(actorRequerido(actor), query),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/horas',
    resumen: 'Registrar horas de la sesión en un ticket, una OT (con tarea opcional) o sin ticket',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    body: RegistroHorasEntrada,
    respuesta: RegistroHorasSalida,
    status: 201,
    handler: async ({ body, actor }) => crearRegistro(actorRequerido(actor), body),
  });

  ruta(router, {
    metodo: 'patch',
    path: '/api/horas/:id',
    resumen:
      'Corregir una fila de horas propia (fecha, horas, fuera de horario, tarea, descripción)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: RegistroHorasEditar,
    respuesta: RegistroHorasSalida,
    handler: async ({ params, body, actor }) =>
      editarRegistro(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'delete',
    path: '/api/horas/:id',
    resumen: 'Eliminar una fila de horas propia',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    respuesta: z.void(),
    status: 204,
    handler: async ({ params, actor }) => eliminarRegistro(actorRequerido(actor), params.id),
  });

  return router;
}
