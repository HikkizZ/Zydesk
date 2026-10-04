import { env } from '../../config/env.js';

// Cliente mínimo de la Bot API (spec fase 6 §7.3): solo `sendMessage`, con `fetch` nativo.
// Errores: `reintentar` (429, red, 5xx) o `definitivo` (bot bloqueado, chat inexistente, token inválido, 4xx).
// El token va en la URL de la petición: jamás se registra ni se copia a un error. `message` lleva solo `codigo`.
export class ErrorTelegram extends Error {
  constructor(
    public tipo: 'reintentar' | 'definitivo',
    public codigo: string,
    public retry_after?: number,
  ) {
    super(codigo);
    this.name = 'ErrorTelegram';
  }
}

export interface OpcionesMensaje {
  reply_markup?: unknown;
}

const TIMEOUT_MS = 10_000;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

// Escapa todo texto dinámico antes de mandarlo con `parse_mode: 'HTML'`.
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"]/g, (c) => ESCAPES[c]!);
}

interface RespuestaTelegram {
  ok?: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

function clasificar(status: number, cuerpo: RespuestaTelegram): ErrorTelegram {
  if (status === 429)
    return new ErrorTelegram('reintentar', 'rate_limit', cuerpo.parameters?.retry_after);
  if (status >= 500) return new ErrorTelegram('reintentar', `http_${status}`);
  if (status === 403) return new ErrorTelegram('definitivo', 'bot_bloqueado');
  if (status === 400 && /chat not found/i.test(cuerpo.description ?? '')) {
    return new ErrorTelegram('definitivo', 'chat_no_encontrado');
  }
  if (status === 401 || status === 404) return new ErrorTelegram('definitivo', 'token_invalido');
  return new ErrorTelegram('definitivo', `http_${status}`);
}

export async function enviarMensaje(
  chat_id: number,
  texto_html: string,
  opciones: OpcionesMensaje = {},
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new ErrorTelegram('definitivo', 'sin_token');
  let respuesta: Response;
  try {
    respuesta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text: texto_html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(opciones.reply_markup ? { reply_markup: opciones.reply_markup } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // El error original de `fetch` puede traer la URL (con el token): se descarta
    const timeout = err instanceof Error && err.name === 'TimeoutError';
    throw new ErrorTelegram('reintentar', timeout ? 'timeout' : 'red');
  }
  if (respuesta.ok) return;
  const cuerpo = (await respuesta.json().catch(() => ({}))) as RespuestaTelegram;
  throw clasificar(respuesta.status, cuerpo);
}
