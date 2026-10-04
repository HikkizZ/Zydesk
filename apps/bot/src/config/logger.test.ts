import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { crearLogger, errorSeguro } from './logger.js';

function capturar() {
  const lineas: string[] = [];
  const destino = new Writable({
    write(chunk, _enc, cb) {
      lineas.push(...String(chunk).split('\n').filter(Boolean));
      cb();
    },
  });
  const logger = crearLogger({ nivel: 'debug', entorno: 'test', version: '0', destino });
  return { logger, lineas };
}

describe('logger del bot', () => {
  it('conserva el mensaje del error de errorSeguro, sin el token de la URL de la Bot API', () => {
    const { logger, lineas } = capturar();
    const err = new Error('fallo en https://api.telegram.org/bot123456:ABC-def_ghi/getUpdates');
    logger.error({ err: errorSeguro(err) }, 'error');
    const salida = lineas.join('\n');
    expect(salida).toContain('bot[Redactado]/getUpdates');
    expect(salida).not.toContain('ABC-def_ghi');
    expect(salida).not.toContain('123456:');
  });

  it('sigue redactando token, chat_id y texto', () => {
    const { logger, lineas } = capturar();
    logger.info({ token: 'secreto', chat_id: 99, text: 'hola' }, 'x');
    const salida = lineas.join('\n');
    expect(salida).not.toContain('secreto');
    expect(salida).not.toContain('99');
    expect(salida).not.toContain('hola');
  });
});
