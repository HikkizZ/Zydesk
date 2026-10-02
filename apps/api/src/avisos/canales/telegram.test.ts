import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { fijarEnv } from '../../../test/entorno.js';
import { ErrorTelegram, enviarMensaje, escaparHtml } from '../../integraciones/telegram/cliente.js';
import type { AvisoParaEnviar } from './canal.js';
import { CanalTelegram, construirMensaje } from './telegram.js';

const TOKEN = 'token-de-prueba';

const aviso = (extra: Partial<AvisoParaEnviar> = {}): AvisoParaEnviar => ({
  id: 1,
  tipo: 'mencion',
  texto: 'Camila te mencionó en TK-1048',
  enlace: '/tickets/12',
  entidad: 'ticket',
  entidad_id: 12,
  datos: { codigo: 'TK-1048' },
  ...extra,
});

const respuesta = (status: number, cuerpo: unknown = {}) =>
  new Response(JSON.stringify(cuerpo), { status });

let fetchDoble: MockInstance<typeof fetch>;
beforeEach(() => {
  fijarEnv('TELEGRAM_BOT_TOKEN', TOKEN);
  fijarEnv('WEB_URL', 'http://localhost:5173');
  fetchDoble = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => fetchDoble.mockRestore());

const cuerpoEnviado = (): Record<string, unknown> =>
  JSON.parse(String((fetchDoble.mock.calls[0]![1] as RequestInit).body)) as Record<string, unknown>;

describe('escaparHtml', () => {
  it('escapa &, <, > y comillas', () => {
    expect(escaparHtml(`<img src="x" onerror=alert(1)> & co`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=alert(1)&gt; &amp; co',
    );
  });
});

describe('CanalTelegram', () => {
  it('POST a sendMessage con chat_id, HTML, sin vista previa, texto y enlace con WEB_URL', async () => {
    fetchDoble.mockResolvedValue(respuesta(200, { ok: true }));
    await new CanalTelegram().enviar(aviso(), { chat_id: 555 });
    expect(fetchDoble).toHaveBeenCalledTimes(1);
    expect(fetchDoble.mock.calls[0]![0]).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    const cuerpo = cuerpoEnviado();
    expect(cuerpo).toMatchObject({
      chat_id: 555,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    expect(cuerpo['text']).toBe(
      '<b>Zydesk</b>\n\n<b>TK-1048</b> · Camila te mencionó en TK-1048\n\n<a href="http://localhost:5173/tickets/12">Abrir TK-1048</a>',
    );
    expect(cuerpo['reply_markup']).toBeUndefined();
  });

  it('sin código en los datos no antepone código y el enlace es genérico', () => {
    const { texto_html } = construirMensaje(aviso({ datos: {}, texto: 'Hola' }));
    expect(texto_html).toBe(
      '<b>Zydesk</b>\n\nHola\n\n<a href="http://localhost:5173/tickets/12">Abrir en Zydesk</a>',
    );
  });

  it('el primer código del mensaje es el del aviso, así «responder un aviso» resuelve bien el destino', () => {
    const { texto_html } = construirMensaje(
      aviso({
        tipo: 'ot_cerrada',
        texto: 'OT-0219 se cerró · resolvió el ticket TK-1048',
        datos: { codigo: 'OT-0219' },
      }),
    );
    const plano = texto_html.replace(/<[^>]+>/g, '');
    expect(/\b(TK|OT)-\d+/i.exec(plano)?.[0]).toBe('OT-0219');
  });

  it('escapa el texto dinámico: el <img> de un asunto llega como &lt;img&gt; (prueba 18)', async () => {
    fetchDoble.mockResolvedValue(respuesta(200, { ok: true }));
    await new CanalTelegram().enviar(
      aviso({ texto: 'Te asignó TK-1 «<img src=x onerror=alert(1)>»' }),
      { chat_id: 1 },
    );
    const texto = String(cuerpoEnviado()['text']);
    expect(texto).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(texto).not.toContain('<img');
  });

  it('ot_por_aprobar agrega el botón Aprobar OT; "Ver en la web" solo con WEB_URL https', () => {
    const a = aviso({
      tipo: 'ot_por_aprobar',
      entidad: 'ot',
      entidad_id: 5,
      enlace: '/ots/5',
      datos: { codigo: 'OT-0219' },
    });
    expect(construirMensaje(a).reply_markup).toEqual({
      inline_keyboard: [[{ text: 'Aprobar OT', callback_data: 'aprobar:ot:5' }]],
    });
    fijarEnv('WEB_URL', 'https://desk.example.test');
    expect(construirMensaje(a).reply_markup).toEqual({
      inline_keyboard: [
        [
          { text: 'Aprobar OT', callback_data: 'aprobar:ot:5' },
          { text: 'Ver en la web', url: 'https://desk.example.test/ots/5' },
        ],
      ],
    });
    expect(construirMensaje(aviso()).reply_markup).toBeUndefined();
  });
});

describe('enviarMensaje: clasificación de errores', () => {
  const capturar = async (): Promise<ErrorTelegram> => {
    try {
      await enviarMensaje(1, 'hola');
    } catch (err) {
      return err as ErrorTelegram;
    }
    throw new Error('no lanzó');
  };

  it('429 → reintentar con retry_after', async () => {
    fetchDoble.mockResolvedValue(respuesta(429, { ok: false, parameters: { retry_after: 7 } }));
    const e = await capturar();
    expect(e).toBeInstanceOf(ErrorTelegram);
    expect(e).toMatchObject({ tipo: 'reintentar', codigo: 'rate_limit', retry_after: 7 });
  });

  it('403 (bot bloqueado) y 400 chat not found → definitivo', async () => {
    fetchDoble.mockResolvedValueOnce(
      respuesta(403, { ok: false, description: 'Forbidden: bot was blocked by the user' }),
    );
    expect(await capturar()).toMatchObject({ tipo: 'definitivo', codigo: 'bot_bloqueado' });
    fetchDoble.mockResolvedValueOnce(
      respuesta(400, { ok: false, description: 'Bad Request: chat not found' }),
    );
    expect(await capturar()).toMatchObject({ tipo: 'definitivo', codigo: 'chat_no_encontrado' });
  });

  it('5xx y error de red → reintentar; el mensaje del error no trae la URL ni el token', async () => {
    fetchDoble.mockResolvedValueOnce(respuesta(502));
    expect(await capturar()).toMatchObject({ tipo: 'reintentar', codigo: 'http_502' });
    fetchDoble.mockRejectedValueOnce(
      new TypeError(`fetch failed https://api.telegram.org/bot${TOKEN}/sendMessage`),
    );
    const e = await capturar();
    expect(e).toMatchObject({ tipo: 'reintentar', codigo: 'red' });
    expect(e.message).toBe('red');
    expect(JSON.stringify(e)).not.toContain(TOKEN);
    expect(String(e.stack)).not.toContain(TOKEN);
  });

  it('sin token → definitivo sin_token y no llama a fetch', async () => {
    fijarEnv('TELEGRAM_BOT_TOKEN', undefined);
    expect(await capturar()).toMatchObject({ tipo: 'definitivo', codigo: 'sin_token' });
    expect(fetchDoble).not.toHaveBeenCalled();
  });
});
