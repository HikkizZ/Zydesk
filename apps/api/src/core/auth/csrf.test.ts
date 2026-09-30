import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { manejadorErrores } from '../errores/manejador.js';
import { csrf } from './csrf.js';

function app() {
  const a = express();
  a.use(cookieParser());
  a.use('/api', csrf);
  a.all('/api/x', (_req, res) => {
    res.json({ ok: true });
  });
  a.use(manejadorErrores);
  return a;
}

describe('csrf', () => {
  it('no exige la cabecera en GET', async () => {
    expect((await request(app()).get('/api/x')).status).toBe(200);
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)('%s sin cabecera → 403 CSRF', async (m) => {
    const res = await request(app())[m]('/api/x').set('Cookie', 'sesion=abc');
    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ codigo: 'CSRF', mensaje: 'Petición rechazada' });
  });

  it('exige el valor exacto "Zydesk"', async () => {
    const mal = await request(app()).post('/api/x').set('X-Requested-With', 'XMLHttpRequest');
    expect(mal.status).toBe(403);
    const bien = await request(app()).post('/api/x').set('X-Requested-With', 'Zydesk');
    expect(bien.status).toBe(200);
  });

  it('se salta con Bearer y sin cookie de sesión, pero no con cookie', async () => {
    const bearer = await request(app()).post('/api/x').set('Authorization', 'Bearer abc');
    expect(bearer.status).toBe(200);
    const mixto = await request(app())
      .post('/api/x')
      .set('Authorization', 'Bearer abc')
      .set('Cookie', 'sesion=abc');
    expect(mixto.status).toBe(403);
  });
});
