import type { Bot } from 'grammy';
import type { Update, UserFromGetMe } from 'grammy/types';

export const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'Zydesk de prueba',
  username: 'zydesk_test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as unknown as UserFromGetMe;

export type Llamada = { method: string; payload: Record<string, unknown> };

function respuestaFalsa(method: string, payload: Record<string, unknown>): unknown {
  switch (method) {
    case 'sendMessage':
    case 'editMessageText':
      return {
        message_id: 900,
        date: 1,
        chat: { id: payload['chat_id'] ?? 0, type: 'private' },
        text: payload['text'],
      };
    default:
      return true;
  }
}

/** Captura las llamadas salientes a la Bot API sin tocar la red. */
export function instalarTelegramFalso(bot: Bot): Llamada[] {
  const llamadas: Llamada[] = [];
  bot.api.config.use((_prev, method, payload) => {
    llamadas.push({ method, payload: { ...payload } as Record<string, unknown> });
    return Promise.resolve({
      ok: true,
      result: respuestaFalsa(method, payload as Record<string, unknown>),
    } as never);
  });
  return llamadas;
}

let contador = 1000;
const siguiente = () => ++contador;

const usuario = (chatId: number) => ({
  id: chatId,
  is_bot: false,
  first_name: 'Persona',
  username: 'persona_prueba',
});

const chatPrivado = (chatId: number) => ({
  id: chatId,
  type: 'private' as const,
  first_name: 'Persona',
});

function entidadesDeComando(texto: string) {
  if (!texto.startsWith('/')) return {};
  const largo = texto.split(/\s/)[0]?.length ?? texto.length;
  return { entities: [{ type: 'bot_command', offset: 0, length: largo }] };
}

export function mensajePrivado(
  chatId: number,
  texto: string,
  extras: Record<string, unknown> = {},
): Update {
  return {
    update_id: siguiente(),
    message: {
      message_id: siguiente(),
      date: 1,
      chat: chatPrivado(chatId),
      from: usuario(chatId),
      text: texto,
      ...entidadesDeComando(texto),
      ...extras,
    },
  } as unknown as Update;
}

export function mensajeEnGrupo(chatId: number, texto: string): Update {
  return {
    update_id: siguiente(),
    message: {
      message_id: siguiente(),
      date: 1,
      chat: { id: -chatId, type: 'group', title: 'Grupo' },
      from: usuario(chatId),
      text: texto,
      ...entidadesDeComando(texto),
    },
  } as unknown as Update;
}

/** Respuesta (reply) a un mensaje; `deBot` indica si el mensaje citado lo envió el bot. */
export function respuestaA(chatId: number, texto: string, citado: string, deBot = true): Update {
  return mensajePrivado(chatId, texto, {
    reply_to_message: {
      message_id: siguiente(),
      date: 1,
      chat: chatPrivado(chatId),
      from: deBot ? BOT_INFO : usuario(chatId),
      text: citado,
    },
  });
}

export function reenviado(chatId: number, texto: string, remitente: string): Update {
  return mensajePrivado(chatId, texto, {
    forward_origin: {
      type: 'user',
      date: 1,
      sender_user: { id: 77, is_bot: false, first_name: remitente },
    },
  });
}

export function reenviadoFoto(chatId: number): Update {
  return {
    update_id: siguiente(),
    message: {
      message_id: siguiente(),
      date: 1,
      chat: chatPrivado(chatId),
      from: usuario(chatId),
      photo: [{ file_id: 'f', file_unique_id: 'u', width: 1, height: 1 }],
      forward_origin: {
        type: 'user',
        date: 1,
        sender_user: { id: 77, is_bot: false, first_name: 'Ana' },
      },
    },
  } as unknown as Update;
}

/** Pulsación de un botón en línea sobre `mensaje` (un mensaje del bot). */
export function callback(chatId: number, data: string, mensaje: { texto: string }): Update {
  return {
    update_id: siguiente(),
    callback_query: {
      id: `cb${siguiente()}`,
      from: usuario(chatId),
      chat_instance: 'ci',
      data,
      message: {
        message_id: siguiente(),
        date: 1,
        chat: chatPrivado(chatId),
        from: BOT_INFO,
        text: mensaje.texto,
      },
    },
  } as unknown as Update;
}

export const textos = (llamadas: Llamada[]): string[] =>
  llamadas
    .filter((l) => l.method === 'sendMessage' || l.method === 'editMessageText')
    .map((l) => String(l.payload['text']));
