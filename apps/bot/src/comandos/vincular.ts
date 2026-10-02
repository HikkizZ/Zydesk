import type { Bot, Context } from 'grammy';
import { BotVincularEntrada } from '@zydesk/shared';
import { ErrorApi } from '../api/cliente.js';
import { escaparHtml } from '../formato.js';
import { responder, sinSesion, TEXTO_NO_RESPONDE, type Deps } from '../nucleo.js';
import { TEXTO_BIENVENIDA } from './ayuda.js';

const TEXTO_CODIGO_INVALIDO = 'Código inválido o vencido: genera uno nuevo en la app.';

function erroresVincular(err: ErrorApi): string | null {
  switch (err.status) {
    case 400:
      return TEXTO_CODIGO_INVALIDO;
    case 409:
      return 'Este chat ya está vinculado a otra cuenta. Esa cuenta debe desvincularlo primero (Avisos → Telegram).';
    case 429:
      return 'Demasiados intentos; espera 15 minutos.';
    case 401:
      // X-Bot-Key rechazada: es un problema de configuración, no de la persona
      return TEXTO_NO_RESPONDE;
    default:
      return null;
  }
}

async function vincular(ctx: Context, deps: Deps, entrada: string): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  // El mensaje contiene el código: se borra siempre, con o sin éxito (mejor esfuerzo).
  if (ctx.message)
    await ctx.api.deleteMessage(chatId, ctx.message.message_id).catch(() => undefined);

  const codigo = entrada.replace(/\s+/g, '').toUpperCase();
  const valido = BotVincularEntrada.shape.codigo.safeParse(codigo);
  if (!valido.success) {
    await responder(ctx, TEXTO_CODIGO_INVALIDO);
    return;
  }
  const r = await deps.api.vincular({
    codigo: valido.data,
    chat_id: chatId,
    telegram_usuario: ctx.from?.username ?? null,
  });
  deps.almacen.guardar(chatId, {
    token: r.token,
    usuario_id: r.usuario.id,
    nombre: r.usuario.nombre,
  });
  const primerNombre = r.usuario.nombre.split(' ')[0] ?? r.usuario.nombre;
  await responder(
    ctx,
    `Listo, ${escaparHtml(primerNombre)}: tu cuenta quedó vinculada. Prueba /hoy`,
  );
}

export function registrarVincular(bot: Bot, deps: Deps): void {
  bot.command('start', (ctx) => {
    const argumento = ctx.match.trim();
    return sinSesion(
      ctx,
      deps,
      'start',
      async () => {
        if (!argumento) {
          await responder(ctx, TEXTO_BIENVENIDA);
          return;
        }
        await vincular(ctx, deps, argumento);
      },
      { errores: erroresVincular },
    );
  });

  bot.command('vincular', (ctx) =>
    sinSesion(
      ctx,
      deps,
      'vincular',
      async () => {
        const argumento = ctx.match.trim();
        if (!argumento) {
          await responder(
            ctx,
            'Envía /vincular CÓDIGO con el código que generas en Avisos → Vincular Telegram.',
          );
          return;
        }
        await vincular(ctx, deps, argumento);
      },
      { errores: erroresVincular },
    ),
  );
}
