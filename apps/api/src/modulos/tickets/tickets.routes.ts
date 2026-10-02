import { Router } from 'express';
import { z } from 'zod';
import {
  CambioEstadoTicket,
  LineaTiempoQuery,
  LineaTiempoSalida,
  ResponsablesEntrada,
  SeguidoresEntrada,
  TableroQuery,
  TicketCrearEntrada,
  TicketEditarEntrada,
  TicketResumen,
  TicketSalida,
  TicketsQuery,
} from '@zydesk/shared';
import { dataSource } from '../../config/db.js';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import {
  cambiarEstado,
  crearTicket,
  editarTicket,
  guardarResponsables,
  guardarSeguidores,
  listar,
  obtenerTicket,
  tablero,
} from './tickets.service.js';
import { lineaDeTiempo } from './tickets.consulta.js';

const idParam = z.coerce.number().int().positive();
const paramsId = z.object({ id: idParam });
const ETIQUETA = 'Tickets';

const Paginado = z.object({
  datos: z.array(TicketResumen),
  total: z.number().int(),
  pagina: z.number().int(),
  por_pagina: z.number().int(),
});

export function crearRutasTickets(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/tickets',
    resumen: 'Listar tickets (paginado, con filtros)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    query: TicketsQuery,
    respuesta: Paginado,
    handler: async ({ query, actor }) => listar(actorRequerido(actor), query),
  });

  // Antes de '/api/tickets/:id' para que "tablero" no se interprete como id.
  ruta(router, {
    metodo: 'get',
    path: '/api/tickets/tablero',
    resumen: 'Tickets del Tablero (no archivados, sin paginar)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    query: TableroQuery,
    respuesta: z.array(TicketResumen),
    handler: async ({ query, actor }) => tablero(actorRequerido(actor), query),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/tickets/linea-de-tiempo',
    resumen: 'Línea de tiempo del equipo (días hábiles del departamento de quien mira, ADR 0016)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    query: LineaTiempoQuery,
    respuesta: LineaTiempoSalida,
    handler: async ({ query, actor }) =>
      lineaDeTiempo(dataSource.manager, actorRequerido(actor).id, query),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/tickets/:id',
    resumen: 'Detalle de un ticket',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    params: paramsId,
    respuesta: TicketSalida,
    handler: async ({ params }) => obtenerTicket(params.id),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/tickets',
    resumen: 'Crear un ticket',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    body: TicketCrearEntrada,
    respuesta: TicketSalida,
    status: 201,
    handler: async ({ body, actor }) => crearTicket(actorRequerido(actor), body),
  });

  ruta(router, {
    metodo: 'patch',
    path: '/api/tickets/:id',
    resumen: 'Editar campos de un ticket (no cerrado)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: TicketEditarEntrada,
    respuesta: TicketSalida,
    handler: async ({ params, body, actor }) =>
      editarTicket(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/tickets/:id/cambiar-estado',
    resumen: 'Cambiar el estado de un ticket (incluye reabrir)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: CambioEstadoTicket,
    respuesta: TicketSalida,
    handler: async ({ params, body, actor }) =>
      cambiarEstado(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'put',
    path: '/api/tickets/:id/responsables',
    resumen: 'Reemplazar los responsables de un ticket (principal y otros)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: ResponsablesEntrada,
    respuesta: TicketSalida,
    handler: async ({ params, body, actor }) =>
      guardarResponsables(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'put',
    path: '/api/tickets/:id/seguidores',
    resumen: 'Reemplazar los seguidores de un ticket',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: SeguidoresEntrada,
    respuesta: TicketSalida,
    handler: async ({ params, body, actor }) =>
      guardarSeguidores(actorRequerido(actor), params.id, body),
  });

  return router;
}
