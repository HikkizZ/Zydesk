import { Router } from 'express';
import { z } from 'zod';
import { DocumentoLegalSalida } from '@zydesk/shared';
import { ruta } from '../../core/http/ruta.js';
import { documentoLegal } from './legal.service.js';

export function crearRutasLegal(): Router {
  const router = Router();
  ruta(router, {
    metodo: 'get',
    path: '/api/legal/:clave',
    resumen: 'Documento legal (terminos o privacidad)',
    etiqueta: 'Legal',
    permiso: 'publico',
    params: z.object({ clave: z.enum(['terminos', 'privacidad']) }),
    respuesta: DocumentoLegalSalida,
    handler: async ({ params }) => documentoLegal(params.clave),
  });
  return router;
}
