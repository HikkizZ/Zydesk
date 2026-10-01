import { Router } from 'express';
import { z } from 'zod';
import {
  AplicarPlantillaEntrada,
  CotizacionEntrada,
  CotizacionResumen,
  CotizacionSalida,
  CotizacionesQuery,
  ImportarHorasEntrada,
} from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { contentDisposition } from '../../core/http/descarga.js';
import { ruta } from '../../core/http/ruta.js';
import {
  aplicarPlantilla,
  crearCotizacion,
  descargarCotizacion,
  duplicarCotizacion,
  editarCotizacion,
  eliminarCotizacion,
  enviarCotizacion,
  importarHoras,
  listar,
  obtener,
} from './cotizaciones.service.js';

const paramsId = z.object({ id: z.coerce.number().int().positive() });
const ETIQUETA = 'Cotizaciones';

const Paginado = z.object({
  datos: z.array(CotizacionResumen),
  total: z.number().int(),
  pagina: z.number().int(),
  por_pagina: z.number().int(),
});

export function crearRutasCotizaciones(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/cotizaciones',
    resumen: 'Listar cotizaciones (paginado, con filtros)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    query: CotizacionesQuery,
    respuesta: Paginado,
    handler: async ({ query }) => listar(query),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/cotizaciones/:id',
    resumen: 'Detalle de una cotización',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    params: paramsId,
    respuesta: CotizacionSalida,
    handler: async ({ params }) => obtener(params.id),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/ots/:id/cotizaciones',
    resumen: 'Crear la primera versión (borrador) de la cotización de una OT facturable',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    respuesta: CotizacionSalida,
    status: 201,
    handler: async ({ params, actor }) => crearCotizacion(actorRequerido(actor), params.id),
  });

  ruta(router, {
    metodo: 'put',
    path: '/api/cotizaciones/:id',
    resumen:
      'Guardar el borrador vigente (reemplaza encabezado y líneas; la API recalcula los totales)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: CotizacionEntrada,
    respuesta: CotizacionSalida,
    handler: async ({ params, body, actor }) =>
      editarCotizacion(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/cotizaciones/:id/importar-horas',
    resumen: 'Agregar una línea por cada tarea de la OT con horas (tarifa del cliente o global)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: ImportarHorasEntrada,
    respuesta: CotizacionSalida,
    handler: async ({ params, body, actor }) =>
      importarHoras(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/cotizaciones/:id/aplicar-plantilla',
    resumen: 'Agregar las líneas de una plantilla activa',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    body: AplicarPlantillaEntrada,
    respuesta: CotizacionSalida,
    handler: async ({ params, body, actor }) =>
      aplicarPlantilla(actorRequerido(actor), params.id, body),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/cotizaciones/:id/enviar',
    resumen: 'Marcar como enviada (la OT pasa a Cotizada; no envía correo)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    respuesta: CotizacionSalida,
    handler: async ({ params, actor }) => enviarCotizacion(actorRequerido(actor), params.id),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/cotizaciones/:id/duplicar',
    resumen: 'Duplicar la versión vigente como un borrador nuevo (vN+1)',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    respuesta: CotizacionSalida,
    status: 201,
    handler: async ({ params, actor }) => duplicarCotizacion(actorRequerido(actor), params.id),
  });

  ruta(router, {
    metodo: 'delete',
    path: '/api/cotizaciones/:id',
    resumen: 'Eliminar el borrador vigente',
    etiqueta: ETIQUETA,
    permiso: 'tickets.editar',
    params: paramsId,
    respuesta: z.void(),
    status: 204,
    handler: async ({ params, actor }) => eliminarCotizacion(actorRequerido(actor), params.id),
  });

  for (const formato of ['xlsx', 'pdf'] as const) {
    ruta(router, {
      metodo: 'get',
      path: `/api/cotizaciones/:id/descargar.${formato}`,
      resumen: `Descargar la cotización como ${formato === 'xlsx' ? 'planilla .xlsx (con fórmulas)' : 'PDF'} (attachment)`,
      etiqueta: ETIQUETA,
      permiso: 'sesion',
      params: paramsId,
      respuesta: z.unknown(),
      handler: async ({ params, actor, res }) => {
        const { buffer, nombre, tipo_mime } = await descargarCotizacion(
          actorRequerido(actor),
          params.id,
          formato,
        );
        res.set({
          'Content-Type': tipo_mime,
          'Content-Length': String(buffer.length),
          'Content-Disposition': contentDisposition('attachment', nombre),
          'Cache-Control': 'no-store',
        });
        res.end(buffer);
        return undefined;
      },
    });
  }

  return router;
}
