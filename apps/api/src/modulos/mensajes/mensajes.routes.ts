import { Router } from 'express';
import { z } from 'zod';
import {
  ActividadQuery,
  ActividadSalida,
  MensajeEntrada,
  MensajeSalida,
  MensajesQuery,
} from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import {
  actividadDeOt,
  actividadDeTicket,
  copiarMensajeAlTicket,
  crearMensaje,
  crearMensajeDeOt,
  listarMensajes,
  listarMensajesDeOt,
} from './mensajes.service.js';

const paramsId = z.object({ id: z.coerce.number().int().positive() });
const ETIQUETA = 'Mensajes';

export function crearRutasMensajes(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'post',
    path: '/api/tickets/:id/mensajes',
    resumen: 'Registrar un seguimiento o una nota interna (con archivos, menciones y horas)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: MensajeEntrada,
    respuesta: MensajeSalida,
    status: 201,
    handler: async ({ params, body, actor }) =>
      crearMensaje(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/tickets/:id/mensajes',
    resumen: 'Listar los mensajes de un ticket (las notas internas las ve todo rol)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    params: paramsId,
    query: MensajesQuery,
    respuesta: z.array(MensajeSalida),
    handler: async ({ params, query }) => listarMensajes(params.id, query.tipo),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/tickets/:id/actividad',
    resumen: 'Actividad del ticket: mensajes y eventos con conteos por pestaña',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    params: paramsId,
    query: ActividadQuery,
    respuesta: ActividadSalida,
    handler: async ({ params, query }) => actividadDeTicket(params.id, query),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/ots/:id/mensajes',
    resumen:
      'Registrar un seguimiento o una nota interna en una OT (con archivos, menciones, horas y copia al ticket)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: MensajeEntrada,
    respuesta: MensajeSalida,
    status: 201,
    handler: async ({ params, body, actor }) =>
      crearMensajeDeOt(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/ots/:id/mensajes',
    resumen: 'Listar los mensajes de una OT (las notas internas las ve todo rol)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    params: paramsId,
    query: MensajesQuery,
    respuesta: z.array(MensajeSalida),
    handler: async ({ params, query }) => listarMensajesDeOt(params.id, query.tipo),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/ots/:id/actividad',
    resumen: 'Actividad de la OT: mensajes y eventos con conteos por pestaña',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    params: paramsId,
    query: ActividadQuery,
    respuesta: ActividadSalida,
    handler: async ({ params, query }) => actividadDeOt(params.id, query),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/mensajes/:id/copiar-al-ticket',
    resumen: 'Copiar un seguimiento o nota de una OT al ticket de origen (una copia por mensaje)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    respuesta: MensajeSalida,
    status: 201,
    handler: async ({ params, actor }) => copiarMensajeAlTicket(actorRequerido(actor), params.id),
  });

  return router;
}
