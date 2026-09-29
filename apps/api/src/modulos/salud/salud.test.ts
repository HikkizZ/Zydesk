import { Writable } from 'node:stream';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearApp } from '../../app.js';
import { crearLogger } from '../../config/logger.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = async () => true;
const caido = async () => false;

describe('GET /api/salud', () => {
  it('responde 200 con estado ok y x-request-id UUID', async () => {
    const res = await request(crearApp({ comprobarBd: ok })).get('/api/salud');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok', version: expect.any(String), bd: 'ok' });
    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it('respeta X-Request-Id válido y reemplaza el inválido', async () => {
    const app = crearApp({ comprobarBd: ok });
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const a = await request(app).get('/api/salud').set('X-Request-Id', id);
    expect(a.headers['x-request-id']).toBe(id);
    const b = await request(app).get('/api/salud').set('X-Request-Id', 'no-es-uuid');
    expect(b.headers['x-request-id']).not.toBe('no-es-uuid');
    expect(b.headers['x-request-id']).toMatch(UUID);
  });

  it('responde 503 si la BD falla', async () => {
    const res = await request(crearApp({ comprobarBd: caido })).get('/api/salud');
    expect(res.status).toBe(503);
    expect(res.body.bd).toBe('error');
    expect(res.body.estado).toBe('error');
  });

  it('responde 404 con formato de error en rutas /api inexistentes', async () => {
    const res = await request(crearApp({ comprobarBd: ok })).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Ruta no encontrada' } });
  });

  it('registra la línea de fin de petición con las claves esperadas', async () => {
    const lineas: Record<string, unknown>[] = [];
    const destino = new Writable({
      write(chunk, _enc, cb) {
        for (const l of String(chunk).split('\n').filter(Boolean)) lineas.push(JSON.parse(l));
        cb();
      },
    });
    const logger = crearLogger({
      nivel: 'info',
      entorno: 'test',
      version: '0.0.0',
      bonito: false,
      destino,
    });
    const res = await request(crearApp({ comprobarBd: ok, logger })).get('/api/salud');
    const linea = lineas.find((l) => l['msg'] === 'petición completada');
    expect(linea).toBeDefined();
    expect(Object.keys(linea!).sort()).toEqual(
      [
        'time',
        'level',
        'msg',
        'servicio',
        'version',
        'entorno',
        'req_id',
        'metodo',
        'ruta',
        'status',
        'duracion_ms',
        'ip',
      ].sort(),
    );
    expect(linea!['ruta']).toBe('/api/salud');
    expect(linea!['metodo']).toBe('GET');
    expect(linea!['status']).toBe(200);
    expect(linea!['req_id']).toBe(res.headers['x-request-id']);
  });
});
