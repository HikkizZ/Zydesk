import { createHash } from 'node:crypto';
import type { Bot, Context } from 'grammy';
import { cerrarCallback, conSesion, OPCIONES_HTML, responder, type Deps } from '../nucleo.js';
import { enlace, escaparHtml } from '../formato.js';

const TTL_MS = 10 * 60 * 1000;
const MAX_ASUNTO = 200;
const MAX_DESCRIPCION = 20_000;
const MAX_SOLICITANTE = 120;

type Pendiente = { texto: string; solicitante: string | null; expira: number };

/** Texto reenviado a la espera de confirmación: solo en memoria, 10 minutos. */
export class PendientesReenvio {
  private readonly mapa = new Map<string, Pendiente>();

  constructor(private readonly ahora: () => number = Date.now) {}

  guardar(chatId: number, clave: string, texto: string, solicitante: string | null): void {
    this.limpiar();
    this.mapa.set(`${chatId}:${clave}`, { texto, solicitante, expira: this.ahora() + TTL_MS });
  }

  tomar(chatId: number, clave: string): Pendiente | undefined {
    this.limpiar();
    const k = `${chatId}:${clave}`;
    const p = this.mapa.get(k);
    this.mapa.delete(k);
    return p;
  }

  private limpiar(): void {
    const ahora = this.ahora();
    for (const [k, p] of this.mapa) if (p.expira <= ahora) this.mapa.delete(k);
  }
}

type Reenviado = {
  forward_origin?: {
    type: string;
    sender_user?: { first_name: string };
    sender_user_name?: string;
  };
};

// Solo el nombre que Telegram expone; null si el remitente lo oculta o es un canal
function solicitanteDe(msg: Reenviado): string | null {
  const o = msg.forward_origin;
  const nombre = o?.sender_user?.first_name ?? o?.sender_user_name ?? null;
  const limpio = nombre?.trim().slice(0, MAX_SOLICITANTE);
  return limpio ? limpio : null;
}

function primeraLinea(texto: string): string {
  const linea = texto.split('\n').find((l) => l.trim() !== '') ?? texto;
  return linea.trim().slice(0, MAX_ASUNTO);
}

export async function ofrecerCrearTicket(ctx: Context, deps: Deps, texto: string): Promise<void> {
  await conSesion(ctx, deps, 'reenviar', async () => {
    const mensaje = ctx.message;
    const chatId = ctx.chat?.id;
    if (!mensaje || chatId === undefined) return;
    const clave = createHash('sha256')
      .update(`${chatId}:${mensaje.message_id}`)
      .digest('hex')
      .slice(0, 8);
    deps.pendientes.guardar(chatId, clave, texto, solicitanteDe(mensaje as Reenviado));
    await responder(
      ctx,
      `¿Crear un ticket con este texto?\n<i>${escaparHtml(primeraLinea(texto))}</i>`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Crear ticket', callback_data: `crear:${clave}` },
              { text: 'Cancelar', callback_data: `cancelar:${clave}` },
            ],
          ],
        },
      },
    );
  });
}

export async function avisarNoSoportado(ctx: Context, deps: Deps): Promise<void> {
  await conSesion(ctx, deps, 'reenviar_no_soportado', async () => {
    await responder(ctx, 'Por ahora solo puedo crear tickets desde mensajes de texto.');
  });
}

export function registrarCrearTicket(bot: Bot, deps: Deps): void {
  bot.callbackQuery(/^cancelar:([0-9a-f]{8})$/, async (ctx) => {
    if (ctx.chat) deps.pendientes.tomar(ctx.chat.id, ctx.match[1] ?? '');
    await ctx.editMessageText('Listo, no creé el ticket.', {
      ...OPCIONES_HTML,
      reply_markup: { inline_keyboard: [] },
    });
    await cerrarCallback(ctx);
  });

  bot.callbackQuery(/^crear:([0-9a-f]{8})$/, (ctx) =>
    conSesion(ctx, deps, 'crear_ticket', async (sesion) => {
      const chatId = ctx.chat?.id;
      if (chatId === undefined) return;
      const pendiente = deps.pendientes.tomar(chatId, ctx.match[1] ?? '');
      if (!pendiente) {
        await ctx.editMessageText('Esta solicitud venció; reenvía el mensaje de nuevo.', {
          ...OPCIONES_HTML,
          reply_markup: { inline_keyboard: [] },
        });
        await cerrarCallback(ctx);
        return;
      }
      const yo = await deps.api.yo(sesion.token);
      const ticket = await deps.api.crearTicket(sesion.token, {
        asunto: primeraLinea(pendiente.texto),
        descripcion: pendiente.texto.slice(0, MAX_DESCRIPCION),
        cliente_id: null,
        solicitante_nombre: pendiente.solicitante,
        solicitante_correo: null,
        origen: 'interno',
        prioridad: 'media',
        categoria_id: null,
        inicio_planificado: null,
        fecha_limite: null,
        horas_estimadas: null,
        responsable_principal_id: yo.id,
      });
      await ctx.editMessageText(
        `Ticket ${escaparHtml(ticket.codigo)} creado · ${enlace(deps.webUrl, `/tickets/${ticket.id}`, 'abrir')}`,
        { ...OPCIONES_HTML, reply_markup: { inline_keyboard: [] } },
      );
      await cerrarCallback(ctx);
    }),
  );
}
