import type { Bot } from 'grammy';
import { cabeceraMiDia, formatearMiDia } from '@zydesk/shared';
import { conSesion, responder, type Deps } from '../nucleo.js';

export function registrarHoy(bot: Bot, deps: Deps): void {
  bot.command('hoy', (ctx) =>
    conSesion(ctx, deps, 'hoy', async (sesion) => {
      const m = await deps.api.miDia(sesion.token);
      // Mismo formato que el resumen diario de la API (spec fase 6 §8.2)
      const texto = formatearMiDia(m, { url: `${deps.webUrl}/mi-dia` });
      await responder(ctx, texto ?? `${cabeceraMiDia(m.fecha)}\n\nNada pendiente.`);
    }),
  );
}
