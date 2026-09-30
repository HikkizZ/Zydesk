import { apiReference } from '@scalar/express-api-reference';
import { Router } from 'express';
import { z } from 'zod';
import { autenticar } from '../auth/autenticar.js';
import { requiere } from '../auth/requiere.js';
import { generarDocumento } from './openapi.js';
import { ruta } from './ruta.js';

export function crearRutasDocs(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/openapi.json',
    resumen: 'Documento OpenAPI de la API',
    etiqueta: 'Documentación',
    permiso: 'config.editar',
    respuesta: z.record(z.string(), z.unknown()),
    handler: async () => generarDocumento() as unknown as Record<string, unknown>,
  });

  // Página Scalar: sin sesión redirige al ingreso; con sesión exige config.editar.
  router.get(
    '/api/docs',
    autenticar,
    (req, res, next) => {
      if (!res.locals['actor']) {
        res.redirect(302, '/ingresar?volver=/api/docs');
        return;
      }
      next();
    },
    requiere('config.editar'),
    apiReference({ url: '/api/openapi.json', pageTitle: 'Zydesk API' }),
  );

  return router;
}
