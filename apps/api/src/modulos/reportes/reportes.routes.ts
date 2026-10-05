import { Router } from 'express';
import { z } from 'zod';
import { ReporteSalida, ReportesQuery } from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { contentDisposition } from '../../core/http/descarga.js';
import { ruta } from '../../core/http/ruta.js';
import { exportarReporte, obtenerReporte } from './reportes.service.js';

const ETIQUETA = 'Reportes';

export function crearRutasReportes(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/reportes',
    resumen:
      'Reportes: indicadores, horas por semana, carga vs capacidad, resolución y tabla por cliente',
    etiqueta: ETIQUETA,
    permiso: 'reportes.ver',
    query: ReportesQuery,
    respuesta: ReporteSalida,
    handler: async ({ query, actor }) => obtenerReporte(actorRequerido(actor), query),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/reportes/exportar.xlsx',
    resumen: 'Exportar los reportes (.xlsx, cinco hojas) con los filtros vigentes (attachment)',
    etiqueta: ETIQUETA,
    permiso: 'reportes.ver',
    query: ReportesQuery,
    respuesta: z.unknown(),
    handler: async ({ query, actor, req, res }) => {
      const filtros = Object.keys(req.query)
        .filter((k) => Object.hasOwn(ReportesQuery.shape, k))
        .sort();
      const { buffer, nombre, tipo_mime } = await exportarReporte(
        actorRequerido(actor),
        query,
        filtros,
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

  return router;
}
