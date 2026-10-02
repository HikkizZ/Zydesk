import { Router } from 'express';
import { z } from 'zod';
import {
  BotVincularEntrada,
  BotVincularSalida,
  CodigoVinculoSalida,
  TelegramEstadoSalida,
} from '@zydesk/shared';
import { requiereClaveBot } from '../../core/auth/clave-bot.js';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import { crearCodigo, desvincular, obtenerEstado, vincular } from './telegram.service.js';

const sinCuerpo = z.void();
const ETIQUETA = 'Telegram';

export function crearRutasTelegram(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/yo/telegram',
    resumen: 'Estado de la vinculación de Telegram de la persona',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    respuesta: TelegramEstadoSalida,
    handler: async ({ actor }) => obtenerEstado(actorRequerido(actor)),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/yo/telegram/codigo',
    resumen: 'Generar un código de vinculación de un solo uso (10 min; solo con sesión web)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    respuesta: CodigoVinculoSalida,
    status: 201,
    handler: async ({ actor }) => crearCodigo(actorRequerido(actor)),
  });

  ruta(router, {
    metodo: 'delete',
    path: '/api/yo/telegram',
    resumen: 'Desvincular Telegram: borra el vínculo y las sesiones del bot (idempotente)',
    etiqueta: ETIQUETA,
    permiso: 'sesion',
    respuesta: sinCuerpo,
    status: 204,
    handler: async ({ actor }) => {
      await desvincular(actorRequerido(actor));
    },
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/bot/vincular',
    resumen: 'Vincular un chat de Telegram con un código (autenticado con X-Bot-Key)',
    etiqueta: ETIQUETA,
    permiso: 'publico',
    previos: [requiereClaveBot],
    body: BotVincularEntrada,
    respuesta: BotVincularSalida,
    status: 201,
    handler: async ({ body }) => vincular(body),
  });

  return router;
}
