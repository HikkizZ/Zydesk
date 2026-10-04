import type PgBoss from 'pg-boss';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { crearAviso, crearUsuario, crearVinculoTelegram } from '../../../test/fabricas.js';
import { fijarEnv } from '../../../test/entorno.js';
import { dataSource } from '../../config/db.js';
import { logger as loggerGlobal } from '../../config/logger.js';
import { ErrorTelegram } from '../../integraciones/telegram/cliente.js';
import { encolarEnvio, enviarAvisoTelegram } from './enviar-aviso.js';

const TOKEN = 'token-de-prueba';
const TEXTO_SECRETO = 'Texto-del-aviso-que-no-va-a-logs';

let fetchDoble: MockInstance<typeof fetch>;
beforeEach(() => {
  fijarEnv('TELEGRAM_BOT_TOKEN', TOKEN);
  fetchDoble = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => fetchDoble.mockRestore());

const ok = () => new Response('{"ok":true}', { status: 200 });
const err = (status: number, cuerpo: unknown = {}) =>
  new Response(JSON.stringify(cuerpo), { status });

async function preparar(opciones: { vinculo?: boolean } = {}) {
  const u = await crearUsuario();
  if (opciones.vinculo !== false) await crearVinculoTelegram(u.id, { chat_id: 987654 });
  const a = await crearAviso(u.id, { texto: TEXTO_SECRETO });
  await dataSource.query(
    `INSERT INTO aviso_envio (aviso_id, canal, estado) VALUES ($1, 'telegram', 'pendiente')`,
    [a.id],
  );
  return { u, a };
}

const envio = async (aviso_id: string | number) =>
  (
    await dataSource.query(
      `SELECT estado, intentos, error, enviado_en FROM aviso_envio WHERE aviso_id = $1`,
      [aviso_id],
    )
  )[0] as { estado: string; intentos: number; error: string | null; enviado_en: Date | null };

const contexto = (extra: { intento?: number; ultimo_intento?: boolean } = {}) => ({
  job_id: 'job-1',
  intento: 1,
  ultimo_intento: false,
  ...extra,
});

describe('enviarAvisoTelegram', () => {
  it('éxito: enviado con enviado_en, intentos 1 y ultimo_envio_en del vínculo', async () => {
    const { u, a } = await preparar();
    fetchDoble.mockResolvedValue(ok());
    await enviarAvisoTelegram(Number(a.id), contexto());
    const e = await envio(a.id);
    expect(e).toMatchObject({ estado: 'enviado', intentos: 1, error: null });
    expect(e.enviado_en).not.toBeNull();
    const [v] = await dataSource.query(
      `SELECT ultimo_envio_en FROM vinculo_telegram WHERE usuario_id = $1`,
      [u.id],
    );
    expect(v.ultimo_envio_en).not.toBeNull();
    const cuerpo = JSON.parse(String((fetchDoble.mock.calls[0]![1] as RequestInit).body)) as {
      chat_id: number;
      text: string;
    };
    expect(cuerpo.chat_id).toBe(987654);
    expect(cuerpo.text).toContain(TEXTO_SECRETO);
  });

  it('sin vínculo: omitido / sin_vinculo y no llama a Telegram', async () => {
    const { a } = await preparar({ vinculo: false });
    await enviarAvisoTelegram(Number(a.id), contexto());
    expect(await envio(a.id)).toMatchObject({ estado: 'omitido', error: 'sin_vinculo' });
    expect(fetchDoble).not.toHaveBeenCalled();
  });

  it('sin token: omitido / sin_token', async () => {
    const { a } = await preparar();
    fijarEnv('TELEGRAM_BOT_TOKEN', undefined);
    await enviarAvisoTelegram(Number(a.id), contexto());
    expect(await envio(a.id)).toMatchObject({ estado: 'omitido', error: 'sin_token' });
    expect(fetchDoble).not.toHaveBeenCalled();
  });

  it('403 (bot bloqueado): fallido sin reintentar ni lanzar', async () => {
    const { a } = await preparar();
    fetchDoble.mockResolvedValue(err(403, { ok: false, description: 'Forbidden' }));
    await expect(enviarAvisoTelegram(Number(a.id), contexto())).resolves.toBeUndefined();
    expect(await envio(a.id)).toMatchObject({
      estado: 'fallido',
      error: 'bot_bloqueado',
      intentos: 1,
    });
  });

  it('429: cuenta el intento, sigue pendiente y lanza para que pg-boss reintente', async () => {
    const { a } = await preparar();
    fetchDoble.mockResolvedValue(err(429, { ok: false, parameters: { retry_after: 3 } }));
    await expect(enviarAvisoTelegram(Number(a.id), contexto())).rejects.toBeInstanceOf(
      ErrorTelegram,
    );
    expect(await envio(a.id)).toMatchObject({
      estado: 'pendiente',
      error: 'rate_limit',
      intentos: 1,
    });
  });

  it('al agotar los reintentos queda fallido sin lanzar', async () => {
    const { a } = await preparar();
    fetchDoble.mockResolvedValue(err(502));
    await expect(
      enviarAvisoTelegram(Number(a.id), contexto({ intento: 4, ultimo_intento: true })),
    ).resolves.toBeUndefined();
    expect(await envio(a.id)).toMatchObject({ estado: 'fallido', error: 'http_502', intentos: 1 });
  });

  it('un envío ya resuelto no se repite (idempotente)', async () => {
    const { a } = await preparar();
    fetchDoble.mockResolvedValue(ok());
    await enviarAvisoTelegram(Number(a.id), contexto());
    await enviarAvisoTelegram(Number(a.id), contexto());
    expect(fetchDoble).toHaveBeenCalledTimes(1);
  });

  it('pruebas 11 y 20: ni la URL con el token, ni el texto, ni el chat_id llegan al logger', async () => {
    const lineas: string[] = [];
    const espias = (['trace', 'debug', 'info', 'warn', 'error'] as const).map((nivel) =>
      vi.spyOn(loggerGlobal, nivel).mockImplementation(((...args: unknown[]) => {
        lineas.push(
          JSON.stringify(args, (_k, v: unknown) =>
            v instanceof Error ? { m: v.message, s: v.stack } : v,
          ),
        );
      }) as never),
    );
    try {
      const { a } = await preparar();
      fetchDoble.mockRejectedValueOnce(
        new TypeError(`fetch failed https://api.telegram.org/bot${TOKEN}/sendMessage`),
      );
      await expect(enviarAvisoTelegram(Number(a.id), contexto())).rejects.toBeInstanceOf(
        ErrorTelegram,
      );
      fetchDoble.mockResolvedValueOnce(err(403, { ok: false, description: TEXTO_SECRETO }));
      await enviarAvisoTelegram(Number(a.id), contexto({ intento: 2 }));
      const todo = lineas.join('\n');
      expect(todo).toContain('bot_bloqueado');
      expect(todo).not.toContain(TOKEN);
      expect(todo).not.toContain('api.telegram.org');
      expect(todo).not.toContain(TEXTO_SECRETO);
      expect(todo).not.toContain('987654');
    } finally {
      espias.forEach((e) => e.mockRestore());
    }
  });
});

describe('encolarEnvio', () => {
  it('encola con singletonKey aviso:canal', async () => {
    const send = vi.fn().mockResolvedValue('job');
    await encolarEnvio({ send } as unknown as PgBoss, '42', 'telegram');
    expect(send).toHaveBeenCalledWith(
      'aviso.enviar',
      { aviso_id: 42, canal: 'telegram' },
      { singletonKey: '42:telegram' },
    );
  });
});
