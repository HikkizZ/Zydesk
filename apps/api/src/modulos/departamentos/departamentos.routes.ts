import { Router } from 'express';
import { z } from 'zod';
import {
  DepartamentoEntrada,
  DepartamentoSalida,
  FeriadoEntrada,
  FeriadoSalida,
  FeriadosQuery,
} from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import {
  crearDepartamento,
  crearFeriado,
  editarDepartamento,
  eliminarDepartamento,
  eliminarFeriado,
  listarDepartamentos,
  listarFeriados,
  obtenerDepartamento,
} from './departamentos.service.js';

const paramsId = z.object({ id: z.coerce.number().int().positive() });
const sinCuerpo = z.void();

export function crearRutasDepartamentos(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/departamentos',
    resumen: 'Listar departamentos',
    etiqueta: 'Departamentos',
    permiso: 'sesion',
    respuesta: z.array(DepartamentoSalida),
    handler: async () => listarDepartamentos(),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/departamentos/:id',
    resumen: 'Obtener un departamento',
    etiqueta: 'Departamentos',
    permiso: 'sesion',
    params: paramsId,
    respuesta: DepartamentoSalida,
    handler: async ({ params }) => obtenerDepartamento(params.id),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/departamentos',
    resumen: 'Crear un departamento con su horario',
    etiqueta: 'Departamentos',
    permiso: 'config.editar',
    body: DepartamentoEntrada,
    respuesta: DepartamentoSalida,
    status: 201,
    handler: async ({ actor, body }) => crearDepartamento(actorRequerido(actor), body),
  });

  ruta(router, {
    metodo: 'put',
    path: '/api/departamentos/:id',
    resumen: 'Reemplazar un departamento y su horario',
    etiqueta: 'Departamentos',
    permiso: 'config.editar',
    params: paramsId,
    body: DepartamentoEntrada,
    respuesta: DepartamentoSalida,
    handler: async ({ actor, params, body }) =>
      editarDepartamento(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'delete',
    path: '/api/departamentos/:id',
    resumen: 'Eliminar un departamento sin personas',
    etiqueta: 'Departamentos',
    permiso: 'config.editar',
    params: paramsId,
    respuesta: sinCuerpo,
    status: 204,
    handler: async ({ actor, params }) => eliminarDepartamento(actorRequerido(actor), params.id),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/feriados',
    resumen: 'Listar feriados de un año (generales y del departamento)',
    etiqueta: 'Departamentos',
    permiso: 'sesion',
    query: FeriadosQuery,
    respuesta: z.array(FeriadoSalida),
    handler: async ({ query }) => listarFeriados(query),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/feriados',
    resumen: 'Crear un feriado',
    etiqueta: 'Departamentos',
    permiso: 'config.editar',
    body: FeriadoEntrada,
    respuesta: FeriadoSalida,
    status: 201,
    handler: async ({ actor, body }) => crearFeriado(actorRequerido(actor), body),
  });

  ruta(router, {
    metodo: 'delete',
    path: '/api/feriados/:id',
    resumen: 'Eliminar un feriado',
    etiqueta: 'Departamentos',
    permiso: 'config.editar',
    params: paramsId,
    respuesta: sinCuerpo,
    status: 204,
    handler: async ({ actor, params }) => eliminarFeriado(actorRequerido(actor), params.id),
  });

  return router;
}
