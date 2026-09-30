import express, { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { crearApp } from '../../app.js';
import { manejadorErrores } from '../errores/manejador.js';
import { esquemaPaginacion, paginar } from './paginacion.js';
import { generarDocumento, rutasRegistradas } from './openapi.js';
import { ruta } from './ruta.js';

function appDePrueba() {
  const router = Router();
  ruta(router, {
    metodo: 'post',
    path: '/api/prueba/:id',
    resumen: 'Ruta de prueba',
    etiqueta: 'Prueba',
    permiso: 'publico',
    params: z.object({ id: z.coerce.number().int() }),
    query: esquemaPaginacion,
    body: z.object({ nombre: z.string().min(2) }),
    respuesta: z.object({ id: z.number(), nombre: z.string(), pagina: z.number() }),
    status: 201,
    handler: async ({ params, query, body }) => ({
      id: params.id,
      nombre: body.nombre,
      pagina: query.pagina,
    }),
  });
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(manejadorErrores);
  return app;
}

describe('ruta() y validar', () => {
  it('body inválido → 400 VALIDACION con el detalle por campo', async () => {
    const res = await request(appDePrueba()).post('/api/prueba/3').send({ nombre: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
    expect(res.body.error.detalles.nombre).toHaveLength(1);
  });

  it('params inválidos → 400', async () => {
    const res = await request(appDePrueba()).post('/api/prueba/x').send({ nombre: 'ab' });
    expect(res.status).toBe(400);
    expect(res.body.error.detalles.id).toBeDefined();
  });

  it('datos válidos → status de la definición y datos parseados con valores por defecto', async () => {
    const res = await request(appDePrueba()).post('/api/prueba/3?pagina=2').send({ nombre: 'ab' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 3, nombre: 'ab', pagina: 2 });
    const sinPagina = await request(appDePrueba()).post('/api/prueba/3').send({ nombre: 'ab' });
    expect(sinPagina.body.pagina).toBe(1);
  });

  it('una ruta protegida sin `requiere` configurado no se registra', () => {
    expect(() =>
      ruta(Router(), {
        metodo: 'get',
        path: '/api/cerrada',
        resumen: 'x',
        etiqueta: 'x',
        respuesta: z.object({}),
        handler: async () => ({}),
      }),
    ).toThrow(/requiere/);
  });
});

describe('registro y OpenAPI', () => {
  it('rutasRegistradas() contiene GET /api/salud y generarDocumento() trae paths["/salud"]', () => {
    crearApp({ comprobarBd: async () => true });
    expect(rutasRegistradas()).toContain('GET /api/salud');
    const doc = generarDocumento();
    expect(doc.paths?.['/salud']?.get?.responses?.['200']).toBeDefined();
    expect(doc.servers).toEqual([{ url: '/api' }]);
    expect(doc.components?.securitySchemes).toHaveProperty('cookie');
  });

  it('convierte :id a {id}, describe parámetros y es determinista', () => {
    appDePrueba();
    const a = JSON.stringify(generarDocumento());
    expect(JSON.parse(a).paths['/prueba/{id}'].post.parameters).toBeDefined();
    expect(JSON.stringify(generarDocumento())).toBe(a);
  });
});

describe('paginar', () => {
  it('devuelve el sobre con total y página', () => {
    expect(paginar([1, 2], 10, { pagina: 2, por_pagina: 2 })).toEqual({
      datos: [1, 2],
      total: 10,
      pagina: 2,
      por_pagina: 2,
    });
    expect(esquemaPaginacion.parse({})).toEqual({ pagina: 1, por_pagina: 50 });
    expect(() => esquemaPaginacion.parse({ por_pagina: '500' })).toThrow();
  });
});
