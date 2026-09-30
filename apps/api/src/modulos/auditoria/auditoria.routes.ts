import { Router } from 'express';
import { z } from 'zod';
import { AuditoriaQuery, AuditoriaSalida, type AuditoriaSalidaDatos } from '@zydesk/shared';
import { dataSource } from '../../config/db.js';
import { paginar } from '../../core/http/paginacion.js';
import { ruta } from '../../core/http/ruta.js';

interface FilaAuditoria {
  id: string;
  creado_en: Date;
  accion: string;
  usuario_id: number | null;
  usuario_nombre: string | null;
  ip: string | null;
  req_id: string | null;
  detalle: Record<string, unknown>;
}

const Salida = z.object({
  datos: z.array(AuditoriaSalida),
  total: z.number().int(),
  pagina: z.number().int(),
  por_pagina: z.number().int(),
});

export function crearRutasAuditoria(): Router {
  const router = Router();

  // Solo lectura: no hay escritura por API.
  ruta(router, {
    metodo: 'get',
    path: '/api/auditoria',
    resumen: 'Registro de seguridad (ingresos y acciones sensibles)',
    etiqueta: 'Auditoría',
    permiso: 'config.editar',
    query: AuditoriaQuery,
    respuesta: Salida,
    handler: async ({ query }) => {
      const condiciones: string[] = [];
      const valores: unknown[] = [];
      const agregar = (sql: (n: number) => string, valor: unknown) => {
        valores.push(valor);
        condiciones.push(sql(valores.length));
      };
      if (query.accion) agregar((n) => `a.accion = $${n}`, query.accion);
      if (query.usuario_id) agregar((n) => `a.usuario_id = $${n}`, query.usuario_id);
      if (query.correo) agregar((n) => `a.detalle->>'correo' = lower($${n})`, query.correo);
      if (query.desde) agregar((n) => `a.creado_en >= $${n}::timestamptz`, query.desde);
      if (query.hasta) agregar((n) => `a.creado_en <= $${n}::timestamptz`, query.hasta);
      const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

      const [{ total }] = (await dataSource.query(
        `SELECT count(*)::int AS total FROM auditoria a ${where}`,
        valores,
      )) as [{ total: number }];
      const filas: FilaAuditoria[] = await dataSource.query(
        `SELECT a.id, a.creado_en, a.accion, a.usuario_id, u.nombre AS usuario_nombre,
                host(a.ip) AS ip, a.req_id, a.detalle
           FROM auditoria a LEFT JOIN usuario u ON u.id = a.usuario_id
           ${where}
          ORDER BY a.creado_en DESC, a.id DESC
          LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
        [...valores, query.por_pagina, (query.pagina - 1) * query.por_pagina],
      );
      const datos: AuditoriaSalidaDatos[] = filas.map((f) => ({
        id: Number(f.id),
        creado_en: f.creado_en.toISOString(),
        accion: f.accion,
        usuario:
          f.usuario_id !== null ? { id: f.usuario_id, nombre: f.usuario_nombre ?? '' } : null,
        ip: f.ip,
        req_id: f.req_id,
        detalle: f.detalle,
      }));
      return paginar(datos, total, query);
    },
  });

  return router;
}
