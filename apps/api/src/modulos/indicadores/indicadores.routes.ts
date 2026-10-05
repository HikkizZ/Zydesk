import { Router } from 'express';
import { IndicadorUfSalida } from '@zydesk/shared';
import { ruta } from '../../core/http/ruta.js';
import { obtenerUf } from './indicadores.service.js';

export function crearRutasIndicadores(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/indicadores/uf',
    resumen: 'Valor vigente de la UF (null si aún no hay valor) y si está desactualizado',
    etiqueta: 'Indicadores',
    permiso: 'sesion',
    respuesta: IndicadorUfSalida.nullable(),
    handler: async () => obtenerUf(),
  });

  return router;
}
