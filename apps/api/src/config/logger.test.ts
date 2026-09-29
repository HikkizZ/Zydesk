import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { contexto } from '../core/http/contexto.js';
import { crearLogger } from './logger.js';

function crearCaptura() {
  const lineas: Record<string, unknown>[] = [];
  const destino = new Writable({
    write(chunk, _enc, cb) {
      for (const l of String(chunk).split('\n').filter(Boolean)) lineas.push(JSON.parse(l));
      cb();
    },
  });
  const logger = crearLogger({
    nivel: 'debug',
    entorno: 'test',
    version: '9.9.9',
    bonito: false,
    destino,
  });
  return { logger, lineas };
}

describe('logger', () => {
  it('redacta claves sensibles', () => {
    const { logger, lineas } = crearCaptura();
    logger.info(
      { password: 'x', usuario: { contrasena: 'y', token: 'z' }, authorization: 'Bearer a' },
      'hola',
    );
    const l = lineas[0] as {
      password: string;
      usuario: Record<string, string>;
      [k: string]: unknown;
    };
    expect(l.password).toBe('[Redactado]');
    expect(l.usuario['contrasena']).toBe('[Redactado]');
    expect(l.usuario['token']).toBe('[Redactado]');
    expect(l['authorization']).toBe('[Redactado]');
    expect(l['msg']).toBe('hola');
  });

  it('usa el formato base', () => {
    const { logger, lineas } = crearCaptura();
    logger.info('hola');
    const l = lineas[0]!;
    expect(Number.isNaN(Date.parse(l['time'] as string))).toBe(false);
    expect(l['level']).toBe('info');
    expect(l['servicio']).toBe('api');
    expect(l['version']).toBe('9.9.9');
    expect(l['entorno']).toBe('test');
    expect(l).not.toHaveProperty('pid');
    expect(l).not.toHaveProperty('hostname');
  });

  it('serializa errores con claves estándar', () => {
    const { logger, lineas } = crearCaptura();
    logger.error({ err: new Error('boom') }, 'falló');
    const err = lineas[0]!['err'] as Record<string, unknown>;
    expect(err['type']).toBe('Error');
    expect(err['message']).toBe('boom');
    expect(typeof err['stack']).toBe('string');
  });

  it('inyecta req_id desde el contexto', () => {
    const { logger, lineas } = crearCaptura();
    contexto.run({ req_id: 'abc' }, () => logger.info('x'));
    logger.info('y');
    expect(lineas[0]!['req_id']).toBe('abc');
    expect(lineas[1]).not.toHaveProperty('req_id');
  });
});
