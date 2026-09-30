import { Router } from 'express';
import { CalcularPlazoEntrada, CalcularPlazoSalida } from '@zydesk/shared';
import { ruta } from '../../core/http/ruta.js';
import { calcularPlazo } from './plazos.service.js';

export function crearRutasPlazos(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'post',
    path: '/api/plazos/calcular',
    resumen: 'Calcular el vencimiento de un plazo en horas hábiles del departamento',
    etiqueta: 'Plazos',
    permiso: 'sesion',
    body: CalcularPlazoEntrada,
    respuesta: CalcularPlazoSalida,
    handler: async ({ body }) => calcularPlazo(body),
  });

  return router;
}
