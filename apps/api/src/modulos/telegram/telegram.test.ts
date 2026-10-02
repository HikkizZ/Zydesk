import { createHash } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  comoBot,
  crearCodigoVinculo,
  crearUsuario,
  crearVinculoTelegram,
  ingresarComo,
  ingresarComoBot,
} from '../../../test/fabricas.js';
import { fijarEnv } from '../../../test/entorno.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });
const sha256 = (t: string): string => createHash('sha256').update(t).digest('hex');
const comoTokenBearer = (token: string): ReturnType<typeof request.agent> =>
  request.agent(app()).set('Authorization', `Bearer ${token}`);
const conToken = (): void => fijarEnv('TELEGRAM_BOT_TOKEN', 'token-de-prueba');

describe('GET /api/yo/telegram', () => {
  it('sin vínculo: no vinculado; disponible según el token y bot_usuario del entorno', async () => {
    const u = await crearUsuario();
    const { agente } = await ingresarComo(app(), u);
    let r = await agente.get('/api/yo/telegram');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      vinculado: false,
      telegram_usuario: null,
      vinculado_en: null,
      sesion_bot_activa: false,
      bot_usuario: null,
      disponible: false,
    });
    conToken();
    fijarEnv('TELEGRAM_BOT_USUARIO', 'zydesk_dev_bot');
    r = await agente.get('/api/yo/telegram');
    expect(r.body).toMatchObject({ disponible: true, bot_usuario: 'zydesk_dev_bot' });
  });

  it('vinculado con sesión del bot vigente, y sin ella tras cerrarla', async () => {
    const u = await crearUsuario();
    const { agente } = await ingresarComo(app(), u);
    await crearVinculoTelegram(u.id);
    let r = await agente.get('/api/yo/telegram');
    expect(r.body).toMatchObject({ vinculado: true, sesion_bot_activa: true });
    await dataSource.query(`DELETE FROM sesion WHERE origen = 'bot'`);
    r = await agente.get('/api/yo/telegram');
    expect(r.body).toMatchObject({ vinculado: true, sesion_bot_activa: false });
  });
});

describe('POST /api/yo/telegram/codigo', () => {
  it('201 con código de 8 caracteres, enlace t.me armado por el servidor y solo el hash en BD', async () => {
    conToken();
    fijarEnv('TELEGRAM_BOT_USUARIO', 'zydesk_dev_bot');
    const u = await crearUsuario();
    const { agente } = await ingresarComo(app(), u);
    const r = await agente.post('/api/yo/telegram/codigo');
    expect(r.status).toBe(201);
    expect(r.body.codigo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(r.body.enlace).toBe(`https://t.me/zydesk_dev_bot?start=${r.body.codigo}`);
    const [fila] = await dataSource.query(`SELECT codigo_hash, expira_en FROM codigo_vinculo`);
    expect(fila.codigo_hash).toBe(sha256(r.body.codigo));
    const dur = new Date(fila.expira_en).getTime() - Date.now();
    expect(dur).toBeGreaterThan(9 * 60_000);
    expect(dur).toBeLessThanOrEqual(10 * 60_000);
  });

  it('sin TELEGRAM_BOT_USUARIO el enlace es null', async () => {
    conToken();
    const u = await crearUsuario();
    const { agente } = await ingresarComo(app(), u);
    expect((await agente.post('/api/yo/telegram/codigo')).body.enlace).toBeNull();
  });

  it('el enlace nunca es un valor libre: TELEGRAM_BOT_USUARIO se valida en env (sin @, solo caracteres de usuario)', async () => {
    const { cargarEnv } = await import('../../config/env.js');
    const base = {
      DATABASE_URL: 'postgres://u:p@localhost:5432/d',
      TELEGRAM_BOT_USUARIO: '@mi_bot',
    };
    expect(cargarEnv(base).TELEGRAM_BOT_USUARIO).toBe('mi_bot');
    expect(() => cargarEnv({ ...base, TELEGRAM_BOT_USUARIO: 'x/../evil?a=b' })).toThrow(
      /TELEGRAM_BOT_USUARIO/,
    );
  });
});

describe('POST /api/bot/vincular', () => {
  it('201: token del bot, usuario, sesión bot de 30 d / 90 d y vínculo guardado', async () => {
    const u = await crearUsuario({ nombre: 'Camila Rojas', rol: 'coordinacion' });
    const codigo = await crearCodigoVinculo(u.id);
    const r = await comoBot(app())
      .post('/api/bot/vincular')
      .send({ codigo: ` ${codigo.toLowerCase()} `, chat_id: 555, telegram_usuario: 'camila' });
    expect(r.status).toBe(201);
    expect(r.body.usuario).toMatchObject({ id: u.id, nombre: 'Camila Rojas', rol: 'coordinacion' });
    const dur = new Date(r.body.expira_en).getTime() - Date.now();
    expect(dur).toBeGreaterThan(29 * 86_400_000);
    expect(dur).toBeLessThanOrEqual(30 * 86_400_000);
    const [s] = await dataSource.query(
      `SELECT origen, mantener, ip, user_agent, id, expira_max_en FROM sesion WHERE usuario_id = $1`,
      [u.id],
    );
    expect(s).toMatchObject({ origen: 'bot', mantener: true, ip: null, user_agent: 'Telegram' });
    expect(new Date(s.expira_max_en).getTime() - Date.now()).toBeGreaterThan(89 * 86_400_000);
    const [v] = await dataSource.query(`SELECT * FROM vinculo_telegram WHERE usuario_id = $1`, [
      u.id,
    ]);
    expect(v).toMatchObject({ chat_id: '555', telegram_usuario: 'camila', sesion_id: s.id });
    const [c] = await dataSource.query(`SELECT usado_en FROM codigo_vinculo`);
    expect(c.usado_en).not.toBeNull();
    // el token devuelto autentica como la persona
    const yo = await comoTokenBearer(r.body.token).get('/api/yo');
    expect(yo.status).toBe(200);
    expect(yo.body.id).toBe(u.id);
  });

  it('re-vincular con otro chat reemplaza el vínculo y cierra la sesión bot anterior', async () => {
    const u = await crearUsuario();
    const viejo = await ingresarComoBot(app(), u);
    const codigo = await crearCodigoVinculo(u.id);
    const r = await comoBot(app()).post('/api/bot/vincular').send({ codigo, chat_id: 9001 });
    expect(r.status).toBe(201);
    expect((await viejo.agente.get('/api/yo')).status).toBe(401);
    const [v] = await dataSource.query(`SELECT chat_id, sesion_id FROM vinculo_telegram`);
    expect(v.chat_id).toBe('9001');
    expect(v.sesion_id).not.toBeNull();
    const [n] = await dataSource.query(
      `SELECT count(*)::int AS n FROM sesion WHERE origen = 'bot'`,
    );
    expect(n.n).toBe(1);
  });

  it('un código de un usuario inactivo → 400 CODIGO_INVALIDO', async () => {
    const u = await crearUsuario({ activo: false });
    const codigo = await crearCodigoVinculo(u.id);
    const r = await comoBot(app()).post('/api/bot/vincular').send({ codigo, chat_id: 1 });
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('CODIGO_INVALIDO');
  });
});

describe('DELETE /api/yo/telegram', () => {
  it('204 idempotente: sin vínculo no falla ni audita', async () => {
    const u = await crearUsuario();
    const { agente } = await ingresarComo(app(), u);
    expect((await agente.delete('/api/yo/telegram')).status).toBe(204);
    expect((await agente.delete('/api/yo/telegram')).status).toBe(204);
    const [n] = await dataSource.query(`SELECT count(*)::int AS n FROM auditoria`);
    expect(n.n).toBe(0);
  });

  it('desde el bot (Bearer de su sesión) también desvincula', async () => {
    const u = await crearUsuario();
    const { agente } = await ingresarComoBot(app(), u);
    expect((await agente.delete('/api/yo/telegram')).status).toBe(204);
    expect(await dataSource.query(`SELECT 1 FROM vinculo_telegram`)).toHaveLength(0);
  });

  it('no toca las sesiones web de la persona', async () => {
    const u = await crearUsuario();
    const { agente } = await ingresarComo(app(), u);
    await crearVinculoTelegram(u.id);
    expect((await agente.delete('/api/yo/telegram')).status).toBe(204);
    expect((await agente.get('/api/yo')).status).toBe(200);
  });
});
