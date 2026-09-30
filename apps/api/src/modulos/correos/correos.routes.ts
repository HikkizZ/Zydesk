import { Router } from 'express';
import { CorreoParsearEntrada, CorreoParseadoSalida } from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import { parsearCorreo } from './correos.service.js';

export function crearRutasCorreos(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'post',
    path: '/api/correos/parsear',
    resumen: 'Leer un correo (archivo pendiente .eml/.msg o texto pegado) sin guardar nada',
    etiqueta: 'Correos',
    permiso: 'tickets.editar',
    body: CorreoParsearEntrada,
    respuesta: CorreoParseadoSalida,
    handler: async ({ actor, body }) => parsearCorreo(actorRequerido(actor), body),
  });

  return router;
}
