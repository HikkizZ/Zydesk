import type { Bot } from 'grammy';
import { responder, sinSesion, type Deps } from '../nucleo.js';

export const TEXTO_AYUDA = [
  '<b>Comandos</b>',
  '/hoy · tu resumen del día',
  '/mis · tus tickets abiertos',
  '/ticket 1048 · la ficha de un ticket',
  '/vincular CÓDIGO · vincula tu cuenta',
  '/desvincular · quita la vinculación',
  '',
  '<b>Acciones</b>',
  '• Responde a un aviso de un ticket u OT para registrar un seguimiento.',
  '• Reenvíame un mensaje de texto para crear un ticket con él.',
].join('\n');

export const TEXTO_BIENVENIDA = [
  '<b>Hola, soy el bot de Zydesk.</b>',
  'Para vincular tu cuenta entra a Zydesk, abre <b>Avisos → Vincular Telegram</b>, genera un código y envíalo aquí con /vincular CÓDIGO.',
  '',
  TEXTO_AYUDA,
].join('\n');

export function registrarAyuda(bot: Bot, deps: Deps): void {
  bot.command('ayuda', (ctx) =>
    sinSesion(ctx, deps, 'ayuda', async () => {
      await responder(ctx, TEXTO_AYUDA);
    }),
  );
}
