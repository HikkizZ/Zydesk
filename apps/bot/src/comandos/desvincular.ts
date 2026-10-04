import type { Bot } from 'grammy';
import { cerrarCallback, conSesion, OPCIONES_HTML, responder, type Deps } from '../nucleo.js';

export function registrarDesvincular(bot: Bot, deps: Deps): void {
  bot.command('desvincular', (ctx) =>
    conSesion(ctx, deps, 'desvincular', async () => {
      await responder(ctx, '¿Desvincular tu cuenta de este chat? Dejarás de recibir avisos aquí.', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Sí, desvincular', callback_data: 'desvincular:si' },
              { text: 'Cancelar', callback_data: 'desvincular:no' },
            ],
          ],
        },
      });
    }),
  );

  bot.callbackQuery('desvincular:si', (ctx) =>
    conSesion(ctx, deps, 'desvincular_confirmar', async (sesion) => {
      await deps.api.desvincular(sesion.token);
      deps.almacen.borrar(ctx.chat?.id ?? 0);
      await ctx.editMessageText('Cuenta desvinculada.', {
        ...OPCIONES_HTML,
        reply_markup: { inline_keyboard: [] },
      });
      await cerrarCallback(ctx);
    }),
  );

  bot.callbackQuery('desvincular:no', async (ctx) => {
    await ctx.editMessageText('Listo, no cambié nada.', {
      ...OPCIONES_HTML,
      reply_markup: { inline_keyboard: [] },
    });
    await cerrarCallback(ctx);
  });
}
