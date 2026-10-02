import type { Bot } from 'grammy';
import type { ErrorApi } from '../api/cliente.js';
import { escaparHtml, fechaHoraCorta } from '../formato.js';
import { cerrarCallback, conSesion, OPCIONES_HTML, type Deps } from '../nucleo.js';

function erroresAprobar(err: ErrorApi): string | null {
  if (err.status === 403) return 'No tienes permiso para aprobar.';
  if (err.status === 409 && err.codigo === 'TRANSICION_INVALIDA') {
    return 'La OT ya no está en borrador.';
  }
  return null;
}

export function registrarAprobar(bot: Bot, deps: Deps): void {
  // El id viene de `callback_data` (no confiable): la API decide si la persona puede aprobar.
  bot.callbackQuery(/^aprobar:ot:(\d{1,9})$/, (ctx) =>
    conSesion(
      ctx,
      deps,
      'aprobar_ot',
      async (sesion) => {
        const ot = await deps.api.aprobarOt(sesion.token, Number(ctx.match[1]));
        await ctx.editMessageText(
          `✓ ${escaparHtml(ot.codigo)} aprobada por ti el ${fechaHoraCorta(deps.ahora())}`,
          { ...OPCIONES_HTML, reply_markup: { inline_keyboard: [] } },
        );
        await cerrarCallback(ctx);
      },
      { errores: erroresAprobar },
    ),
  );
}
