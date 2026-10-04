import { env } from '../../config/env.js';
import { enviarMensaje, escaparHtml } from '../../integraciones/telegram/cliente.js';
import type { AvisoParaEnviar, Canal } from './canal.js';

// Canal Telegram (spec fase 6 §7.3): `texto` + enlace absoluto a la web; el bot no agrega nada más.
// Solo `ot_por_aprobar` lleva botones (el bot atiende `aprobar:ot:<id>`; la API autoriza con el Bearer del usuario).
export function construirMensaje(aviso: AvisoParaEnviar): {
  texto_html: string;
  reply_markup?: unknown;
} {
  const url = `${env.WEB_URL}${aviso.enlace}`;
  const codigo = typeof aviso.datos['codigo'] === 'string' ? aviso.datos['codigo'] : null;
  // Los textos ya traen el código: se resalta su primera aparición (la negrita con el código es la que usa
  // «responder un aviso» para resolver el destino). Si el texto no lo trae, se antepone.
  const texto = escaparHtml(aviso.texto);
  let cuerpo = texto;
  if (codigo) {
    const negrita = `<b>${escaparHtml(codigo)}</b>`;
    const i = texto.indexOf(escaparHtml(codigo));
    cuerpo =
      i === -1
        ? `${negrita} · ${texto}`
        : texto.slice(0, i) + negrita + texto.slice(i + escaparHtml(codigo).length);
  }
  const texto_html =
    `<b>Zydesk</b>\n\n${cuerpo}\n\n` +
    `<a href="${escaparHtml(url)}">${codigo ? `Abrir ${escaparHtml(codigo)}` : 'Abrir en Zydesk'}</a>`;
  if (aviso.tipo !== 'ot_por_aprobar') return { texto_html };
  const botones: { text: string; callback_data?: string; url?: string }[] = [
    { text: 'Aprobar OT', callback_data: `aprobar:ot:${aviso.entidad_id}` },
  ];
  // Telegram rechaza botones con URL que no sea https (p. ej. localhost en desarrollo)
  if (url.startsWith('https://')) botones.push({ text: 'Ver en la web', url });
  return { texto_html, reply_markup: { inline_keyboard: [botones] } };
}

export class CanalTelegram implements Canal {
  nombre = 'telegram' as const;

  async enviar(aviso: AvisoParaEnviar, destino: { chat_id: number }): Promise<void> {
    const { texto_html, reply_markup } = construirMensaje(aviso);
    await enviarMensaje(destino.chat_id, texto_html, reply_markup ? { reply_markup } : {});
  }
}
