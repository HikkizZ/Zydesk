import { Router } from 'express';
import { z } from 'zod';
import {
  ClienteEntrada,
  ClienteResumen,
  ClienteSalida,
  ClientesQuery,
  ContactoEntrada,
  ContactoSalida,
  ContratoBolsaEditarEntrada,
  ContratoBolsaEntrada,
  ContratoBolsaSalida,
  TarifaClienteEntrada,
  TarifaClienteSalida,
} from '@zydesk/shared';
import { ruta } from '../../core/http/ruta.js';
import {
  borrarContacto,
  cambiarEstadoCliente,
  crearBolsa,
  crearCliente,
  crearContacto,
  editarBolsa,
  editarCliente,
  editarContacto,
  listarClientes,
  obtenerCliente,
  reemplazarTarifas,
} from './clientes.service.js';

const idParam = z.coerce.number().int().positive();
const paramsId = z.object({ id: idParam });
const paramsContacto = z.object({ id: idParam, contactoId: idParam });
const paramsBolsa = z.object({ id: idParam, contratoId: idParam });
const sinCuerpo = z.void();
const ETIQUETA = 'Clientes';

export function crearRutasClientes(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/clientes',
    resumen: 'Listar clientes (por defecto solo activos)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    query: ClientesQuery,
    respuesta: z.array(ClienteResumen),
    handler: async ({ query }) => listarClientes(query),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/clientes/:id',
    resumen: 'Ficha de un cliente con contactos, bolsa y tarifas',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    params: paramsId,
    respuesta: ClienteSalida,
    handler: async ({ params }) => obtenerCliente(params.id),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/clientes',
    resumen: 'Crear un cliente',
    etiqueta: ETIQUETA,
    permiso: 'config.editar',
    body: ClienteEntrada,
    respuesta: ClienteSalida,
    status: 201,
    handler: async ({ body }) => crearCliente(body),
  });

  ruta(router, {
    metodo: 'patch',
    path: '/api/clientes/:id',
    resumen: 'Editar un cliente',
    etiqueta: ETIQUETA,
    permiso: 'config.editar',
    params: paramsId,
    body: ClienteEntrada.partial(),
    respuesta: ClienteSalida,
    handler: async ({ params, body }) => editarCliente(params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/clientes/:id/desactivar',
    resumen: 'Desactivar un cliente',
    etiqueta: ETIQUETA,
    permiso: 'config.editar',
    params: paramsId,
    respuesta: ClienteSalida,
    handler: async ({ params }) => cambiarEstadoCliente(params.id, false),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/clientes/:id/reactivar',
    resumen: 'Reactivar un cliente',
    etiqueta: ETIQUETA,
    permiso: 'config.editar',
    params: paramsId,
    respuesta: ClienteSalida,
    handler: async ({ params }) => cambiarEstadoCliente(params.id, true),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/clientes/:id/contactos',
    resumen: 'Agregar un contacto al cliente',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: ContactoEntrada,
    respuesta: ContactoSalida,
    status: 201,
    handler: async ({ params, body }) => crearContacto(params.id, body),
  });

  ruta(router, {
    metodo: 'patch',
    path: '/api/clientes/:id/contactos/:contactoId',
    resumen: 'Editar un contacto',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsContacto,
    body: ContactoEntrada.partial(),
    respuesta: ContactoSalida,
    handler: async ({ params, body }) => editarContacto(params.id, params.contactoId, body),
  });

  ruta(router, {
    metodo: 'delete',
    path: '/api/clientes/:id/contactos/:contactoId',
    resumen: 'Quitar un contacto',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsContacto,
    respuesta: sinCuerpo,
    status: 204,
    handler: async ({ params }) => borrarContacto(params.id, params.contactoId),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/clientes/:id/bolsa',
    resumen: 'Agregar un contrato de bolsa de horas',
    etiqueta: ETIQUETA,
    permiso: ['config.editar', 'ots.aprobar'],
    params: paramsId,
    body: ContratoBolsaEntrada,
    respuesta: ContratoBolsaSalida,
    status: 201,
    handler: async ({ params, body }) => crearBolsa(params.id, body),
  });

  ruta(router, {
    metodo: 'patch',
    path: '/api/clientes/:id/bolsa/:contratoId',
    resumen: 'Editar un contrato de bolsa de horas',
    etiqueta: ETIQUETA,
    permiso: ['config.editar', 'ots.aprobar'],
    params: paramsBolsa,
    body: ContratoBolsaEditarEntrada,
    respuesta: ContratoBolsaSalida,
    handler: async ({ params, body }) => editarBolsa(params.id, params.contratoId, body),
  });

  ruta(router, {
    metodo: 'put',
    path: '/api/clientes/:id/tarifas',
    resumen: 'Reemplazar las tarifas acordadas del cliente',
    etiqueta: ETIQUETA,
    permiso: 'config.editar',
    params: paramsId,
    body: TarifaClienteEntrada,
    respuesta: z.array(TarifaClienteSalida),
    handler: async ({ params, body }) => reemplazarTarifas(params.id, body),
  });

  return router;
}
