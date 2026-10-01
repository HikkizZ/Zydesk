import { Router } from 'express';
import { z } from 'zod';
import {
  AprobacionClienteEntrada,
  AprobarOtEntrada,
  ArchivoSalida,
  ArchivosOtEntrada,
  CambioEtapaOt,
  CancelarOt,
  CierreOt,
  FacturarOt,
  OtCrearEntrada,
  OtEditarEntrada,
  OtResumen,
  OtSalida,
  OtsQuery,
} from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import {
  aprobarOt,
  cambiarEtapa,
  cancelarOt,
  facturarOt,
  registrarAprobacionCliente,
} from './ots.etapas.service.js';
import { cerrarOt } from './ots.cierre.service.js';
import { agregarArchivos, convertirEnOt, editarOt, listar, obtenerOt } from './ots.service.js';

const paramsId = z.object({ id: z.coerce.number().int().positive() });
const ETIQUETA = 'Órdenes de trabajo';

const Paginado = z.object({
  datos: z.array(OtResumen),
  total: z.number().int(),
  pagina: z.number().int(),
  por_pagina: z.number().int(),
});

export function crearRutasOts(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'post',
    path: '/api/tickets/:id/convertir-en-ot',
    resumen: 'Convertir un ticket en OT (también "Crear otra OT")',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: OtCrearEntrada,
    respuesta: OtSalida,
    status: 201,
    handler: async ({ params, body, actor }) =>
      convertirEnOt(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/ots',
    resumen: 'Listar OT (paginado, con filtros)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    query: OtsQuery,
    respuesta: Paginado,
    handler: async ({ query }) => listar(query),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/ots/:id',
    resumen: 'Detalle de una OT',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    params: paramsId,
    respuesta: OtSalida,
    handler: async ({ params }) => obtenerOt(params.id),
  });

  ruta(router, {
    metodo: 'patch',
    path: '/api/ots/:id',
    resumen: 'Editar una OT (el tipo y el cliente solo en Borrador)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: OtEditarEntrada,
    respuesta: OtSalida,
    handler: async ({ params, body, actor }) => editarOt(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/ots/:id/cambiar-etapa',
    resumen: 'Cambiar la etapa de una OT (Borrador, En ejecución)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: CambioEtapaOt,
    respuesta: OtSalida,
    handler: async ({ params, body, actor }) =>
      cambiarEtapa(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/ots/:id/aprobar',
    resumen: 'Aprobar una OT interna (opcionalmente iniciar la ejecución)',
    etiqueta: ETIQUETA,
    permiso: 'ots.aprobar',
    params: paramsId,
    body: AprobarOtEntrada,
    respuesta: OtSalida,
    handler: async ({ params, body, actor }) => aprobarOt(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'put',
    path: '/api/ots/:id/aprobacion',
    resumen: 'Registrar la aprobación del cliente de una OT facturable',
    etiqueta: ETIQUETA,
    permiso: 'ots.aprobar',
    params: paramsId,
    body: AprobacionClienteEntrada,
    respuesta: OtSalida,
    handler: async ({ params, body, actor }) =>
      registrarAprobacionCliente(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/ots/:id/cancelar',
    resumen: 'Cancelar una OT (motivo obligatorio)',
    etiqueta: ETIQUETA,
    permiso: 'ots.cerrar',
    params: paramsId,
    body: CancelarOt,
    respuesta: OtSalida,
    handler: async ({ params, body, actor }) => cancelarOt(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/ots/:id/cerrar',
    resumen: 'Cerrar una OT en ejecución (resuelve o no el ticket, con resumen obligatorio)',
    etiqueta: ETIQUETA,
    permiso: 'ots.cerrar',
    params: paramsId,
    body: CierreOt,
    respuesta: OtSalida,
    handler: async ({ params, body, actor }) => cerrarOt(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/ots/:id/facturar',
    resumen: 'Marcar una OT cerrada como facturada',
    etiqueta: ETIQUETA,
    permiso: 'ots.facturar',
    params: paramsId,
    body: FacturarOt,
    respuesta: OtSalida,
    handler: async ({ params, body, actor }) => facturarOt(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/ots/:id/archivos',
    resumen: 'Asociar archivos pendientes a una OT (no cerrada)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: ArchivosOtEntrada,
    respuesta: z.array(ArchivoSalida),
    handler: async ({ params, body, actor }) =>
      agregarArchivos(actorRequerido(actor), params.id, body),
  });

  return router;
}
