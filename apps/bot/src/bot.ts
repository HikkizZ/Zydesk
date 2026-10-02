import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { Logger } from 'pino';
import type { ClienteZydesk } from './api/cliente.js';
import {
  avisarNoSoportado,
  ofrecerCrearTicket,
  PendientesReenvio,
  registrarCrearTicket,
} from './acciones/crear-ticket.js';
import { registrarAprobar } from './acciones/aprobar.js';
import { responderAviso } from './acciones/responder-aviso.js';
import { registrarAyuda } from './comandos/ayuda.js';
import { registrarDesvincular } from './comandos/desvincular.js';
import { registrarHoy } from './comandos/hoy.js';
import { registrarMis } from './comandos/mis.js';
import { registrarTicket } from './comandos/ticket.js';
import { registrarVincular } from './comandos/vincular.js';
import { errorSeguro } from './config/logger.js';
import { conSesion, responder, type Deps } from './nucleo.js';
import type { AlmacenSesiones } from './sesiones/almacen.js';

export const COMANDOS = [
  { command: 'hoy', description: 'Tu resumen del día' },
  { command: 'mis', description: 'Tus tickets abiertos' },
  { command: 'ticket', description: 'Ficha de un ticket: /ticket 1048' },
  { command: 'vincular', description: 'Vincula tu cuenta: /vincular CÓDIGO' },
  { command: 'desvincular', description: 'Quita la vinculación' },
  { command: 'ayuda', description: 'Comandos y acciones' },
];

export function crearBot(opciones: {
  token: string;
  api: ClienteZydesk;
  almacen: AlmacenSesiones;
  logger: Logger;
  webUrl: string;
  botInfo?: UserFromGetMe;
  ahora?: () => Date;
}): Bot {
  const ahora = opciones.ahora ?? (() => new Date());
  const deps: Deps = {
    api: opciones.api,
    almacen: opciones.almacen,
    logger: opciones.logger,
    webUrl: opciones.webUrl,
    ahora,
    pendientes: new PendientesReenvio(() => ahora().getTime()),
  };
  const bot = new Bot(opciones.token, opciones.botInfo ? { botInfo: opciones.botInfo } : {});

  // Solo chats privados: el bot actúa como una persona (§25.17).
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type !== 'private') return;
    await next();
  });

  registrarVincular(bot, deps);
  registrarDesvincular(bot, deps);
  registrarHoy(bot, deps);
  registrarMis(bot, deps);
  registrarTicket(bot, deps);
  registrarAyuda(bot, deps);
  registrarAprobar(bot, deps);
  registrarCrearTicket(bot, deps);

  bot.on('message:text', async (ctx) => {
    const texto = ctx.message.text;
    const citado = ctx.message.reply_to_message;
    if (citado && citado.from?.id === ctx.me.id) {
      await responderAviso(ctx, deps, citado.text ?? citado.caption ?? '', texto);
      return;
    }
    if (ctx.message.forward_origin) {
      await ofrecerCrearTicket(ctx, deps, texto);
      return;
    }
    await conSesion(ctx, deps, 'texto', async () => {
      await responder(ctx, 'No entendí. Escribe /ayuda');
    });
  });

  // Fotos, documentos y reenvíos sin texto
  bot.on('message', async (ctx) => {
    if (ctx.message.forward_origin) await avisarNoSoportado(ctx, deps);
  });

  bot.catch((err) => {
    opciones.logger.error({ err: errorSeguro(err.error) }, 'error no controlado en un manejador');
  });

  return bot;
}
