import type { Context } from 'grammy';
import type { Logger } from 'pino';
import type { ClienteZydesk } from './api/cliente.js';
import { ErrorApi } from './api/cliente.js';
import type { PendientesReenvio } from './acciones/crear-ticket.js';
import { errorSeguro } from './config/logger.js';
import { escaparHtml } from './formato.js';
import type { AlmacenSesiones, SesionBot } from './sesiones/almacen.js';

export type Deps = {
  api: ClienteZydesk;
  almacen: AlmacenSesiones;
  logger: Logger;
  webUrl: string;
  ahora: () => Date;
  pendientes: PendientesReenvio;
};

export const OPCIONES_HTML = {
  parse_mode: 'HTML',
  link_preview_options: { is_disabled: true },
} as const;

export const TEXTO_SIN_VINCULO =
  'Aún no vinculas tu cuenta. Entra a Zydesk, abre <b>Avisos → Vincular Telegram</b>, genera un código y envíalo aquí con /vincular CÓDIGO.';

export const TEXTO_NO_RESPONDE = 'Zydesk no responde ahora; inténtalo en un momento.';

export const TEXTO_SESION_CADUCADA =
  'Tu sesión del bot terminó (se cerró, caducó o desvinculaste la cuenta). Para usar los comandos, genera un código en Zydesk → Avisos → Telegram y envía /vincular CÓDIGO.';

export function responder(ctx: Context, html: string, extra: Record<string, unknown> = {}) {
  return ctx.reply(html, { ...OPCIONES_HTML, ...extra });
}

/** Detiene el indicador de carga del botón; mejor esfuerzo. */
export function cerrarCallback(ctx: Context): Promise<unknown> {
  return ctx.callbackQuery ? ctx.answerCallbackQuery().catch(() => undefined) : Promise.resolve();
}

/** Mensaje para la persona según la respuesta de la API (§19.5). */
export function textoError(err: ErrorApi): string {
  if (err.noDisponible) return TEXTO_NO_RESPONDE;
  switch (err.status) {
    case 401:
      return TEXTO_SESION_CADUCADA;
    case 403:
      if (err.codigo === 'CONTRASENA_PENDIENTE') {
        return 'Entra a la web para cambiar tu contraseña; después vuelve.';
      }
      if (err.codigo === 'TERMINOS_PENDIENTES') {
        return 'Entra a la web para aceptar los términos; después vuelve.';
      }
      return 'No tienes permiso para esta acción.';
    case 404:
      return 'No encuentro eso.';
    case 409:
      return err.mensajeApi ? escaparHtml(err.mensajeApi) : 'No se pudo completar la acción.';
    case 400: {
      const detalle = err.codigo === 'VALIDACION' ? err.primerDetalle() : null;
      return `No pude registrarlo: ${escaparHtml(detalle || err.mensajeApi || 'datos inválidos')}`;
    }
    case 429:
      return 'Demasiadas solicitudes; espera un momento.';
    default:
      return TEXTO_NO_RESPONDE;
  }
}

type Opciones = {
  /** Mensaje propio para ciertos errores; `null` deja el mensaje por defecto (§19.5). */
  errores?: (err: ErrorApi) => string | null;
};

async function correr(
  ctx: Context,
  deps: Deps,
  comando: string,
  fn: () => Promise<void>,
  opciones: Opciones & { borrarEn401: boolean },
): Promise<void> {
  const chatId = ctx.chat?.id;
  const inicio = performance.now();
  const usuarioAntes =
    chatId === undefined ? null : (deps.almacen.obtener(chatId)?.usuario_id ?? null);
  let status = 200;
  try {
    await fn();
  } catch (err) {
    let texto: string;
    if (err instanceof ErrorApi) {
      status = err.status;
      texto = opciones.errores?.(err) ?? textoError(err);
      if (err.status === 401 && opciones.borrarEn401 && chatId !== undefined) {
        deps.almacen.borrar(chatId);
      }
      if (err.noDisponible)
        deps.logger.error({ comando, status: err.status }, 'la API no respondió');
    } else {
      status = 500;
      texto = TEXTO_NO_RESPONDE;
      deps.logger.error({ comando, err: errorSeguro(err) }, 'error inesperado');
    }
    await responder(ctx, texto).catch(() => undefined);
    await cerrarCallback(ctx);
  } finally {
    const usuarioId =
      chatId === undefined
        ? usuarioAntes
        : (deps.almacen.obtener(chatId)?.usuario_id ?? usuarioAntes);
    deps.logger.info(
      {
        comando,
        usuario_id: usuarioId,
        duracion_ms: Math.round(performance.now() - inicio),
        status,
      },
      'comando',
    );
  }
}

/** Ejecuta `fn` con el Bearer del chat; sin vínculo responde las instrucciones y no llama a la API. */
export async function conSesion(
  ctx: Context,
  deps: Deps,
  comando: string,
  fn: (sesion: SesionBot) => Promise<void>,
  opciones: Opciones = {},
): Promise<void> {
  const sesion = ctx.chat ? deps.almacen.obtener(ctx.chat.id) : undefined;
  if (!sesion) {
    await responder(ctx, TEXTO_SIN_VINCULO);
    await cerrarCallback(ctx);
    deps.logger.info({ comando, usuario_id: null, duracion_ms: 0, status: 200 }, 'comando');
    return;
  }
  await correr(ctx, deps, comando, () => fn(sesion), { ...opciones, borrarEn401: true });
}

/** Comandos que no necesitan vínculo previo (/start, /vincular, /ayuda). */
export function sinSesion(
  ctx: Context,
  deps: Deps,
  comando: string,
  fn: () => Promise<void>,
  opciones: Opciones = {},
): Promise<void> {
  return correr(ctx, deps, comando, fn, { ...opciones, borrarEn401: false });
}
