import { Writable } from 'node:stream';
import type { Rol } from '@zydesk/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  crearAviso,
  crearOt,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { esperarDespachos } from '../../avisos/despachador.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { logger as loggerGlobal, crearLogger } from '../../config/logger.js';
import { publicar } from '../../core/eventos/dominio.js';
import { ejecutarVencimientos } from '../../core/jobs/vencimientos.js';
import { metadatosRutas } from '../../core/http/openapi.js';

// Pruebas 1–3, 13, 14, 19–21 de la spec fase 6 §14 (las 4–12 y 15–18 son de otros bloques; la 12 de
// avisos sin contenido vive en avisos/despachador.test.ts).

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: Rol) {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const RUTAS_AVISOS = (): ReturnType<typeof metadatosRutas> =>
  metadatosRutas().filter(
    (r) => r.path.startsWith('/api/avisos') || r.path.startsWith('/api/yo/avisos'),
  );

const avisosDe = (usuario_id: number): Promise<{ tipo: string; texto: string }[]> =>
  dataSource.query(`SELECT tipo, texto FROM aviso WHERE usuario_id = $1 ORDER BY id`, [usuario_id]);

describe('prueba 1: sin sesión', () => {
  it('401 en las seis rutas de avisos y preferencias', async () => {
    const a = app();
    const rutas = RUTAS_AVISOS();
    expect(rutas).toHaveLength(6);
    for (const r of rutas) {
      const res = await request(a)
        [r.metodo](r.path.replace(/:\w+/g, '1'))
        .set('X-Requested-With', 'Zydesk')
        .send({});
      expect(res.status, `${r.metodo} ${r.path}`).toBe(401);
    }
  });
});

describe('prueba 2: avisos propios', () => {
  it('GET solo devuelve los del actor aunque existan de otros', async () => {
    const { agente, usuario } = await como('tecnico');
    const otro = await crearUsuario();
    const mio = await crearAviso(usuario.id);
    await crearAviso(otro.id);
    const r = await agente.get('/api/avisos');
    expect(r.body.datos.map((a: { id: number }) => a.id)).toEqual([Number(mio.id)]);
  });

  it('leer un aviso ajeno → 404 y la fila no cambia', async () => {
    const { agente } = await como('tecnico');
    const otro = await crearUsuario();
    const ajeno = await crearAviso(otro.id);
    const r = await agente.post(`/api/avisos/${ajeno.id}/leer`);
    expect(r.status).toBe(404);
    const [fila] = await dataSource.query(`SELECT leido_en FROM aviso WHERE id = $1`, [ajeno.id]);
    expect(fila.leido_en).toBeNull();
    // mismo cuerpo que un aviso inexistente: no revela existencia
    const inexistente = await agente.post('/api/avisos/999999/leer');
    expect(r.body).toEqual(inexistente.body);
  });

  it('leer-todos no toca los avisos ajenos', async () => {
    const { agente } = await como('tecnico');
    const otro = await crearUsuario();
    const ajeno = await crearAviso(otro.id);
    await agente.post('/api/avisos/leer-todos');
    const [fila] = await dataSource.query(`SELECT leido_en FROM aviso WHERE id = $1`, [ajeno.id]);
    expect(fila.leido_en).toBeNull();
  });

  it('en_app = false no aparece, no cuenta y no se puede marcar', async () => {
    const { agente, usuario } = await como('tecnico');
    const oculto = await crearAviso(usuario.id, { en_app: false });
    expect((await agente.get('/api/avisos')).body.datos).toEqual([]);
    expect((await agente.get('/api/avisos/no-leidos')).body).toEqual({ no_leidos: 0 });
    expect((await agente.post(`/api/avisos/${oculto.id}/leer`)).status).toBe(404);
  });

  it('lectura: 200 en todo lo de avisos y preferencias', async () => {
    const { agente, usuario } = await como('lectura');
    const a = await crearAviso(usuario.id);
    expect((await agente.get('/api/avisos')).status).toBe(200);
    expect((await agente.get('/api/avisos/no-leidos')).status).toBe(200);
    expect((await agente.post(`/api/avisos/${a.id}/leer`)).status).toBe(200);
    expect((await agente.post('/api/avisos/leer-todos')).status).toBe(200);
    expect((await agente.get('/api/yo/avisos/preferencias')).status).toBe(200);
    expect(
      (
        await agente
          .put('/api/yo/avisos/preferencias')
          .send({ filas: [{ evento: 'mencion', app: true, telegram: false }] })
      ).status,
    ).toBe(200);
  });
});

describe('prueba 3: preferencias', () => {
  it('PUT con usuario_id en el cuerpo lo ignora: solo escribe las del actor', async () => {
    const { agente, usuario } = await como('tecnico');
    const otro = await crearUsuario();
    const r = await agente.put('/api/yo/avisos/preferencias').send({
      usuario_id: otro.id,
      filas: [{ evento: 'mencion', usuario_id: otro.id, app: false, telegram: false }],
    });
    expect(r.status).toBe(200);
    const filas: { usuario_id: number }[] = await dataSource.query(
      `SELECT usuario_id FROM preferencia_aviso`,
    );
    expect(new Set(filas.map((f) => f.usuario_id))).toEqual(new Set([usuario.id]));
  });

  it('PUT de correo no rompe, no se guarda y GET no lo expone', async () => {
    const { agente } = await como('tecnico');
    const r = await agente
      .put('/api/yo/avisos/preferencias')
      .send({ filas: [{ evento: 'mencion', app: true, telegram: true, correo: true }] });
    expect(r.status).toBe(200);
    const correos = await dataSource.query(
      `SELECT 1 FROM preferencia_aviso WHERE canal = 'correo'`,
    );
    expect(correos).toEqual([]);
    const g = await agente.get('/api/yo/avisos/preferencias');
    for (const fila of g.body.filas)
      expect(Object.keys(fila).sort()).toEqual(['app', 'evento', 'telegram']);
  });

  it('resumen_diario con app: true, eventos repetidos o evento desconocido → 400', async () => {
    const { agente } = await como('tecnico');
    const put = (filas: unknown) => agente.put('/api/yo/avisos/preferencias').send({ filas });
    expect((await put([{ evento: 'resumen_diario', app: true, telegram: true }])).status).toBe(400);
    expect(
      (
        await put([
          { evento: 'mencion', app: true, telegram: true },
          { evento: 'mencion', app: false, telegram: true },
        ])
      ).status,
    ).toBe(400);
    expect((await put([{ evento: 'otro', app: true, telegram: true }])).status).toBe(400);
    expect((await put([])).status).toBe(400);
    expect(await dataSource.query(`SELECT 1 FROM preferencia_aviso`)).toEqual([]);
  });
});

describe('prueba 13: destinatarios', () => {
  it('el actor no recibe aviso de su propia acción (se asigna, se menciona o cambia su ticket)', async () => {
    const { agente, usuario } = await como('coordinacion');
    const t = await crearTicket({ estado: 'nuevo', principal_id: usuario.id });
    expect(
      (
        await agente.put(`/api/tickets/${t.id}/responsables`).send({
          principal_id: usuario.id,
          otros_ids: [],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await agente.post(`/api/tickets/${t.id}/mensajes`).send({
          tipo: 'seguimiento',
          texto: 'Hola',
          mencionados_ids: [usuario.id],
          archivo_ids: [],
          horas: null,
        })
      ).status,
    ).toBe(201);
    expect(
      (await agente.post(`/api/tickets/${t.id}/cambiar-estado`).send({ estado: 'en_curso' }))
        .status,
    ).toBe(200);
    await esperarDespachos();
    expect(await avisosDe(usuario.id)).toEqual([]);
  });

  it('un usuario inactivo no recibe', async () => {
    const inactivo = await crearUsuario({ activo: false });
    const t = await crearTicket({ principal_id: inactivo.id });
    publicar('ticket.vence_pronto', { ticket_id: t.id, fecha_limite: new Date().toISOString() });
    await esperarDespachos();
    expect(await avisosDe(inactivo.id)).toEqual([]);
  });

  it('por_facturar llega a admin y coordinación activos y a nadie más', async () => {
    const admin = await crearUsuario({ rol: 'admin' });
    const coord = await crearUsuario({ rol: 'coordinacion' });
    const otros = [
      await crearUsuario({ rol: 'tecnico' }),
      await crearUsuario({ rol: 'lectura' }),
      await crearUsuario({ rol: 'admin', activo: false }),
    ];
    const t = await crearTicket();
    const ot = await crearOt(t.id, { etapa: 'cerrada' });
    publicar('ot.por_facturar', { ot_id: ot.id });
    await esperarDespachos();
    expect(await avisosDe(admin.id)).toHaveLength(1);
    expect(await avisosDe(coord.id)).toHaveLength(1);
    for (const u of otros) expect(await avisosDe(u.id)).toEqual([]);
  });

  it('vence_pronto llega solo al responsable principal', async () => {
    const principal = await crearUsuario();
    const otro = await crearUsuario();
    const t = await crearTicket({ principal_id: principal.id, otros_ids: [otro.id] });
    publicar('ticket.vence_pronto', { ticket_id: t.id, fecha_limite: new Date().toISOString() });
    await esperarDespachos();
    expect(await avisosDe(principal.id)).toHaveLength(1);
    expect(await avisosDe(otro.id)).toEqual([]);
  });

  it('una mención a quien no es responsable ni seguidor sí llega y solo revela el mensaje', async () => {
    const { agente } = await como('coordinacion');
    const ajeno = await crearUsuario();
    const t = await crearTicket({ estado: 'en_curso', asunto: 'Asunto visible' });
    const r = await agente.post(`/api/tickets/${t.id}/mensajes`).send({
      tipo: 'nota_interna',
      texto: 'SECRETO-XYZ',
      mencionados_ids: [ajeno.id],
      archivo_ids: [],
      horas: null,
    });
    expect(r.status).toBe(201);
    await esperarDespachos();
    const [aviso] = await dataSource.query(`SELECT * FROM aviso WHERE usuario_id = $1`, [ajeno.id]);
    expect(aviso).toMatchObject({
      tipo: 'mencion',
      enlace: `/tickets/${t.id}#mensaje-${r.body.id}`,
    });
    expect(JSON.stringify(aviso)).not.toContain('SECRETO-XYZ');
  });
});

describe('prueba 14: idempotencia', () => {
  it('ejecutarVencimientos tres veces deja un solo aviso por ticket y persona', async () => {
    const principal = await crearUsuario();
    await crearTicket({
      estado: 'en_curso',
      principal_id: principal.id,
      fecha_limite: new Date(Date.now() + 2 * 3_600_000),
    });
    for (let i = 0; i < 3; i++) {
      await ejecutarVencimientos();
      await esperarDespachos();
    }
    expect(await avisosDe(principal.id)).toHaveLength(1);
  });

  it('publicar ot.por_facturar dos veces deja un aviso por destinatario', async () => {
    const admin = await crearUsuario({ rol: 'admin' });
    const coord = await crearUsuario({ rol: 'coordinacion' });
    const t = await crearTicket();
    const ot = await crearOt(t.id, { etapa: 'cerrada' });
    publicar('ot.por_facturar', { ot_id: ot.id });
    publicar('ot.por_facturar', { ot_id: ot.id });
    await esperarDespachos();
    expect(await avisosDe(admin.id)).toHaveLength(1);
    expect(await avisosDe(coord.id)).toHaveLength(1);
  });
});

describe('prueba 19: rangos', () => {
  it('por_pagina = 201, pagina = 0, filtro desconocido y solo_no_leidos inválido → 400', async () => {
    const { agente } = await como('tecnico');
    expect((await agente.get('/api/avisos?por_pagina=201')).status).toBe(400);
    expect((await agente.get('/api/avisos?por_pagina=200')).status).toBe(200);
    expect((await agente.get('/api/avisos?pagina=0')).status).toBe(400);
    expect((await agente.get('/api/avisos?filtro=otro')).status).toBe(400);
    expect((await agente.get('/api/avisos?solo_no_leidos=quizas')).status).toBe(400);
  });
});

describe('prueba 20: logs sin contenido', () => {
  it('mención por la API y despacho no dejan el texto, el asunto ni la nota en el logger', async () => {
    const lineas: string[] = [];
    const destino = new Writable({
      write(chunk, _enc, cb) {
        lineas.push(...String(chunk).split('\n').filter(Boolean));
        cb();
      },
    });
    const logger = crearLogger({
      nivel: 'debug',
      entorno: 'test',
      version: '0.0.0',
      bonito: false,
      destino,
    });
    const global: string[] = [];
    const espias = (['trace', 'debug', 'info', 'warn', 'error'] as const).map((nivel) =>
      vi.spyOn(loggerGlobal, nivel).mockImplementation(((...args: unknown[]) => {
        global.push(JSON.stringify(args));
      }) as never),
    );
    try {
      const autor = await crearUsuario({ rol: 'coordinacion', nombre: 'Autora Reservada' });
      const u = await crearUsuario();
      const t = await crearTicket({ estado: 'en_curso', asunto: 'ASUNTO-SECRETO-555' });
      const { agente } = await ingresarComo(
        crearApp({ comprobarBd: async () => true, logger }),
        autor,
      );
      const r = await agente.post(`/api/tickets/${t.id}/mensajes`).send({
        tipo: 'nota_interna',
        texto: 'NOTA-SECRETA-777',
        mencionados_ids: [u.id],
        archivo_ids: [],
        horas: null,
      });
      expect(r.status).toBe(201);
      await esperarDespachos();
      expect(await avisosDe(u.id)).toHaveLength(1);
    } finally {
      for (const e of espias) e.mockRestore();
    }
    const todo = [...lineas, ...global].join('\n');
    expect(lineas.length).toBeGreaterThan(0);
    expect(global.length).toBeGreaterThan(0);
    for (const secreto of ['NOTA-SECRETA-777', 'ASUNTO-SECRETO-555', 'te mencionó', 'chat_id']) {
      expect(todo).not.toContain(secreto);
    }
  });
});

describe('prueba 21: X-Request-Id', () => {
  it('presente en el 401 y en el 404 de avisos', async () => {
    const a = app();
    const r401 = await request(a).get('/api/avisos');
    expect(r401.status).toBe(401);
    expect(r401.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const { agente } = await como('tecnico');
    const r404 = await agente.post('/api/avisos/999999/leer');
    expect(r404.status).toBe(404);
    expect(r404.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
