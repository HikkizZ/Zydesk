import { Writable } from 'node:stream';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearLogger } from '../../config/logger.js';
import { crearLogHttp } from './log-http.js';
import { reqId } from './req-id.js';

describe('log-http', () => {
  it('un log posterior a «petición completada» no hereda campos de la petición', async () => {
    const salida: string[] = [];
    const logger = crearLogger({
      nivel: 'debug',
      entorno: 'test',
      version: '0.0.0',
      bonito: false,
      destino: new Writable({
        write(chunk, _enc, cb) {
          salida.push(String(chunk));
          cb();
        },
      }),
    });
    let posterior: () => void = () => undefined;
    const termino = new Promise<void>((r) => (posterior = r));
    const app = express();
    app.use(reqId());
    app.use(crearLogHttp(logger));
    app.get('/p', (_req, res) => {
      res.on('finish', () => {
        logger.info({ evento: 'x' }, 'aviso despachado');
        posterior();
      });
      res.json({ ok: true });
    });
    await request(app).get('/p').set('Cookie', 'sesion=SECRETA-123');
    await termino;
    const lineas = salida.join('').split('\n').filter(Boolean);
    const despues = lineas.map((l) => JSON.parse(l)).find((l) => l.msg === 'aviso despachado');
    expect(despues).toBeDefined();
    expect(despues.req_id).toBeDefined();
    expect(despues).not.toHaveProperty('res');
    expect(despues).not.toHaveProperty('metodo');
    expect(despues).not.toHaveProperty('status');
    expect(JSON.stringify(despues)).not.toMatch(/cookie|sesion=/i);
  });
});
