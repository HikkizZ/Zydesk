import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as compartido from '@zydesk/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { crearUsuario, ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { generarDocumento, metadatosRutas } from './openapi.js';
import { ruta } from './ruta.js';

const app = () => crearApp({ comprobarBd: async () => true });
const raizApi = fileURLToPath(new URL('../../../', import.meta.url));
const archivoOpenApi = fileURLToPath(
  new URL('../../../../../docs/api/openapi.json', import.meta.url),
);
const tsx = fileURLToPath(new URL('../../../../../node_modules/tsx/dist/cli.mjs', import.meta.url));

function generarConCli(): string {
  const r = spawnSync(process.execPath, [tsx, 'src/database/cli.ts', 'openapi'], {
    cwd: raizApi,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', TZ: 'UTC' },
  });
  expect(r.status, r.stdout + r.stderr).toBe(0);
  return readFileSync(archivoOpenApi, 'utf8');
}

describe('18. OpenAPI protegido', () => {
  it('/api/docs y /api/openapi.json: sin sesión redirige/401; técnico 403; admin 200', async () => {
    const a = app();
    const docsSin = await request(a).get('/api/docs');
    expect(docsSin.status).toBe(302);
    expect(docsSin.headers['location']).toBe('/ingresar?volver=/api/docs');
    expect((await request(a).get('/api/openapi.json')).status).toBe(401);

    const tecnico = await ingresarComo(a, await crearUsuario({ rol: 'tecnico' }));
    expect((await tecnico.agente.get('/api/docs')).status).toBe(403);
    expect((await tecnico.agente.get('/api/openapi.json')).status).toBe(403);

    const admin = await ingresarComo(a, await crearUsuario({ rol: 'admin' }));
    const docs = await admin.agente.get('/api/docs');
    expect(docs.status).toBe(200);
    expect(docs.headers['content-type']).toContain('text/html');
    expect(docs.text).toContain('/api/openapi.json');
    const json = await admin.agente.get('/api/openapi.json');
    expect(json.status).toBe(200);
    expect(json.body.openapi).toBe('3.1.0');
    expect(json.body.paths['/yo'].get).toBeDefined();
  });

  it('la CSP se relaja solo en /api/docs', async () => {
    const a = app();
    const admin = await ingresarComo(a, await crearUsuario({ rol: 'admin' }));
    const docs = await admin.agente.get('/api/docs');
    expect(docs.headers['content-security-policy']).toBeUndefined();
    const yo = await admin.agente.get('/api/yo');
    expect(yo.headers['content-security-policy']).toContain("default-src 'self'");
  });
});

describe('documento OpenAPI', () => {
  it('tiene una operación por cada ruta registrada', () => {
    app();
    const doc = generarDocumento();
    const operaciones = Object.values(doc.paths ?? {}).flatMap((p) =>
      Object.keys(p ?? {}).filter((k) => ['get', 'post', 'put', 'patch', 'delete'].includes(k)),
    );
    expect(operaciones).toHaveLength(metadatosRutas().length);
    for (const r of metadatosRutas()) {
      const path = r.path.replace(/^\/api/, '').replace(/:(\w+)/g, '{$1}');
      expect(doc.paths?.[path]?.[r.metodo], `${r.metodo} ${r.path}`).toBeDefined();
    }
    expect(doc.components?.securitySchemes).toMatchObject({
      cookie: { type: 'apiKey', in: 'cookie', name: 'sesion' },
      bearer: { type: 'http', scheme: 'bearer' },
    });
  });

  it('todos los esquemas compartidos de entrada y salida se representan sin lanzar', () => {
    const router = Router();
    const esquemas = (Object.entries(compartido) as [string, unknown][]).filter(
      (e): e is [string, z.ZodType] =>
        /(Entrada|Salida|Query|Resumen)$/.test(e[0]) && e[1] instanceof z.ZodType,
    );
    expect(esquemas.length).toBeGreaterThan(20);
    esquemas.forEach(([nombre, esquema], i) => {
      const esObjeto = esquema instanceof z.ZodObject || nombre.endsWith('Entrada');
      if (!esObjeto) return;
      ruta<unknown, unknown, unknown, unknown>(router, {
        metodo: 'post',
        path: `/api/prueba-esquemas/${i}`,
        resumen: nombre,
        etiqueta: 'Prueba',
        permiso: 'sesion',
        body: esquema,
        respuesta: esquema,
        handler: async () => ({}),
      });
    });
    expect(() => generarDocumento()).not.toThrow();
  });

  it('npm run api:openapi escribe el mismo archivo dos veces seguidas (determinista, sin fechas)', () => {
    const a = generarConCli();
    const b = generarConCli();
    expect(b).toBe(a);
    expect(a.endsWith('}\n')).toBe(true);
    expect(a).toContain('\n  "openapi": "3.1.0"');
    const doc = JSON.parse(a);
    expect(doc.info.title).toBe('Zydesk API');
    expect(doc.paths['/salud']).toBeDefined();
    expect(doc.paths['/auth/ingresar'].post).toBeDefined();
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
  });
});
