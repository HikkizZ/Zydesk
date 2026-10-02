import { Router } from 'express';
import { z } from 'zod';
import {
  AvisoSalida,
  AvisosQuery,
  AvisosSalida,
  LeerTodosSalida,
  NoLeidosSalida,
  PreferenciasEntrada,
  PreferenciasSalida,
} from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import {
  guardarPreferencias,
  listar,
  marcarLeido,
  marcarTodosLeidos,
  noLeidos,
  obtenerPreferencias,
} from './avisos.service.js';

const paramsId = z.object({ id: z.coerce.number().int().positive() });
const ETIQUETA = 'Avisos';

export function crearRutasAvisos(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/avisos',
    resumen: 'Mis avisos (más recientes primero), con filtro por tipo y solo no leídos',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    query: AvisosQuery,
    respuesta: AvisosSalida,
    handler: async ({ query, actor }) => listar(actorRequerido(actor), query),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/avisos/no-leidos',
    resumen: 'Cantidad de avisos no leídos (badge del menú, sondeo de 60 s)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    respuesta: NoLeidosSalida,
    handler: async ({ actor }) => noLeidos(actorRequerido(actor)),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/avisos/leer-todos',
    resumen: 'Marcar todos mis avisos como leídos',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    respuesta: LeerTodosSalida,
    handler: async ({ actor }) => marcarTodosLeidos(actorRequerido(actor)),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/avisos/:id/leer',
    resumen: 'Marcar un aviso propio como leído (idempotente; uno ajeno responde 404)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    params: paramsId,
    respuesta: AvisoSalida,
    handler: async ({ params, actor }) => marcarLeido(actorRequerido(actor), params.id),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/yo/avisos/preferencias',
    resumen: 'Mis preferencias de avisos por evento y canal (con los valores por defecto)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    respuesta: PreferenciasSalida,
    handler: async ({ actor }) => obtenerPreferencias(actorRequerido(actor)),
  });

  ruta(router, {
    metodo: 'put',
    path: '/api/yo/avisos/preferencias',
    resumen: 'Cambiar mis preferencias de avisos (solo las filas enviadas)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    body: PreferenciasEntrada,
    respuesta: PreferenciasSalida,
    handler: async ({ body, actor }) => guardarPreferencias(actorRequerido(actor), body),
  });

  return router;
}
