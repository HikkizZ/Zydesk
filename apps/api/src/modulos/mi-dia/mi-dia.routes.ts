import { Router } from 'express';
import { MiDiaSalida } from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import { obtenerMiDia } from './mi-dia.service.js';

export function crearRutasMiDia(): Router {
  const router = Router();

  // Sin parámetros: siempre es la persona de la sesión (spec fase 6 §14.15).
  ruta(router, {
    metodo: 'get',
    path: '/api/mi-dia',
    resumen: 'Mi día: vencimientos, por aprobar, menciones, tareas y tickets detenidos',
    etiqueta: 'Mi día',
    permiso: 'sesion',
    respuesta: MiDiaSalida,
    handler: async ({ actor }) => obtenerMiDia(actorRequerido(actor)),
  });

  return router;
}
