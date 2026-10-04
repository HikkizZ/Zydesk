import { describe, expect, it } from 'vitest';
import {
  comoBot,
  crearCodigoVinculo,
  crearUsuario,
  crearVinculoTelegram,
  ingresarComo,
} from '../../../test/fabricas.js';
import { fijarEnv } from '../../../test/entorno.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });
const cuenta = async (tabla: 'evento' | 'auditoria'): Promise<number> =>
  Number((await dataSource.query(`SELECT count(*)::int AS n FROM ${tabla}`))[0].n);

// Cobertura de eventos y auditoría (ADR 0003 y 0017, spec fase 6 §13) para la vinculación de Telegram.
describe('vinculación de Telegram: auditoría', () => {
  it('generar el código no deja evento ni auditoria', async () => {
    fijarEnv('TELEGRAM_BOT_TOKEN', 'token-de-prueba');
    const u = await crearUsuario();
    const { agente } = await ingresarComo(app(), u);
    expect((await agente.post('/api/yo/telegram/codigo')).status).toBe(201);
    expect((await agente.get('/api/yo/telegram')).status).toBe(200);
    expect(await cuenta('evento')).toBe(0);
    expect(await cuenta('auditoria')).toBe(0);
  });

  it('vincular deja telegram_vinculado con el chat; un código inválido deja telegram_vinculacion_fallida', async () => {
    const u = await crearUsuario();
    const bot = comoBot(app());
    await bot.post('/api/bot/vincular').send({ codigo: 'ZZZZZZZZ', chat_id: 31 });
    const codigo = await crearCodigoVinculo(u.id);
    await bot.post('/api/bot/vincular').send({ codigo, chat_id: 31 });
    const filas = await dataSource.query(
      `SELECT accion, usuario_id, detalle FROM auditoria ORDER BY id`,
    );
    expect(filas).toEqual([
      {
        accion: 'telegram_vinculacion_fallida',
        usuario_id: null,
        detalle: { chat_id: 31, motivo: 'codigo' },
      },
      { accion: 'telegram_vinculado', usuario_id: u.id, detalle: { chat_id: 31 } },
    ]);
    expect(await cuenta('evento')).toBe(0);
  });

  it('una clave inválida deja telegram_vinculacion_fallida con motivo clave', async () => {
    const { default: request } = await import('supertest');
    await request(app())
      .post('/api/bot/vincular')
      .set('X-Bot-Key', 'mala')
      .send({ codigo: 'ZZZZZZZZ', chat_id: 1 });
    const filas = await dataSource.query(`SELECT accion, detalle FROM auditoria`);
    expect(filas).toEqual([
      { accion: 'telegram_vinculacion_fallida', detalle: { motivo: 'clave' } },
    ]);
  });

  it('desvincular deja telegram_desvinculado y un sesion_cerrada por sesión bot', async () => {
    const u = await crearUsuario();
    const { agente } = await ingresarComo(app(), u);
    await crearVinculoTelegram(u.id);
    expect((await agente.delete('/api/yo/telegram')).status).toBe(204);
    const filas = await dataSource.query(
      `SELECT accion, usuario_id, detalle->>'motivo' AS motivo FROM auditoria ORDER BY id`,
    );
    expect(filas).toEqual([
      { accion: 'sesion_cerrada', usuario_id: u.id, motivo: 'telegram_desvinculado' },
      { accion: 'telegram_desvinculado', usuario_id: u.id, motivo: null },
    ]);
  });
});
