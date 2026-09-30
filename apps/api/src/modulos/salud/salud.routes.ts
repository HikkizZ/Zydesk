import { Router } from 'express';
import { z } from 'zod';
import { VERSION } from '../../config/version.js';
import { ruta } from '../../core/http/ruta.js';

const SaludSalida = z.object({
  estado: z.enum(['ok', 'error']),
  version: z.string(),
  bd: z.enum(['ok', 'error']),
});

export function crearRutaSalud(comprobar: () => Promise<boolean>): Router {
  const router = Router();
  ruta(router, {
    metodo: 'get',
    path: '/api/salud',
    resumen: 'Estado de la API y de la base de datos',
    etiqueta: 'Salud',
    permiso: 'publico',
    respuesta: SaludSalida,
    handler: async ({ res }) => {
      const ok = await comprobar();
      res.status(ok ? 200 : 503);
      return { estado: ok ? 'ok' : 'error', version: VERSION, bd: ok ? 'ok' : 'error' } as const;
    },
  });
  return router;
}
