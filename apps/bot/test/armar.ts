import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { ClienteZydesk } from '../src/api/cliente.js';
import { crearBot } from '../src/bot.js';
import { crearLogger } from '../src/config/logger.js';
import { AlmacenSesiones } from '../src/sesiones/almacen.js';
import { crearFetchFalso } from './api-fake.js';
import { BOT_INFO, instalarTelegramFalso } from './telegram-fake.js';

export const CHAT = 424242;
export const TOKEN_PERSONA = 'TOKEN-PERSONA-SECRETO';
export const TOKEN_BOT = '123456:TOKEN-DEL-BOT-SECRETO';
export const CLAVE_BOT = 'clave-compartida-de-prueba';
export const AHORA = new Date('2026-10-01T13:15:00Z'); // 10:15 en Santiago (UTC-3)

type Tabla = Parameters<typeof crearFetchFalso>[0];

export function armar(tabla: Tabla = {}, opciones: { vinculado?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'zydesk-bot-'));
  const salidaLogs: string[] = [];
  const logger = crearLogger({
    nivel: 'debug',
    entorno: 'test',
    version: '0.0.0',
    destino: new Writable({
      write(chunk, _enc, cb) {
        salidaLogs.push(String(chunk));
        cb();
      },
    }),
  });
  const almacen = new AlmacenSesiones({ dir, clave: randomBytes(32), logger });
  if (opciones.vinculado ?? true) {
    almacen.guardar(CHAT, { token: TOKEN_PERSONA, usuario_id: 5, nombre: 'Sebastián Díaz' });
  }
  const { fetch, peticiones } = crearFetchFalso(tabla);
  const api = new ClienteZydesk({ apiUrl: 'http://api:3000', botKey: CLAVE_BOT, fetch });
  const bot = crearBot({
    token: TOKEN_BOT,
    api,
    almacen,
    logger,
    webUrl: 'https://desk.test',
    botInfo: BOT_INFO,
    ahora: () => AHORA,
  });
  const llamadas = instalarTelegramFalso(bot);
  return { bot, almacen, llamadas, peticiones, logs: () => salidaLogs.join(''), dir };
}
