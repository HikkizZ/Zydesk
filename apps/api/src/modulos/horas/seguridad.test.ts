import { Writable } from 'node:stream';
import type { Rol } from '@zydesk/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  crearOt,
  crearRegistroHoras,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { logger as loggerGlobal, crearLogger } from '../../config/logger.js';
import { metadatosRutas } from '../../core/http/openapi.js';

// Pruebas 1–8, 16 y 17 de la spec §7. Las 9 y 15 viven en horas.mutaciones.test.ts; las 10, 11, 12 y 14,
// en horas.test.ts; la 13, en horas.integraciones.test.ts.

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: Rol) {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const hoy = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const desplazar = (dias: number): string => {
  const [a, m, d] = hoy().split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + dias)).toISOString().slice(0, 10);
};

const filaDe = async (id: number) =>
  (await dataSource.query(`SELECT * FROM registro_horas WHERE id = $1`, [id]))[0];
const nFilas = async (): Promise<number> =>
  Number((await dataSource.query(`SELECT count(*)::int AS n FROM registro_horas`))[0].n);

describe('prueba 1: sin sesión', () => {
  it('401 en las cuatro rutas de horas', async () => {
    const a = app();
    const rutas = metadatosRutas().filter((r) => r.path.startsWith('/api/horas'));
    expect(rutas).toHaveLength(4);
    for (const r of rutas) {
      const res = await request(a)
        [r.metodo](r.path.replace(/:\w+/g, '1'))
        .set('X-Requested-With', 'Zydesk')
        .send({});
      expect(res.status, `${r.metodo} ${r.path}`).toBe(401);
    }
  });
});

describe('prueba 2: roles', () => {
  it('lectura: planilla propia vacía y no editable; 403 en mutaciones y en la ajena', async () => {
    const lectura = await como('lectura');
    const tec = await crearUsuario({ rol: 'tecnico' });
    const t = await crearTicket();
    const fila = await crearRegistroHoras(lectura.usuario.id, { ticket_id: t.id });
    const propia = await lectura.agente.get('/api/horas');
    expect(propia.status).toBe(200);
    expect(propia.body.editable).toBe(false);
    expect(
      (await lectura.agente.post('/api/horas').send({ fecha: hoy(), ticket_id: t.id, horas: 1 }))
        .status,
    ).toBe(403);
    expect((await lectura.agente.patch(`/api/horas/${fila.id}`).send({ horas: 2 })).status).toBe(
      403,
    );
    expect((await lectura.agente.delete(`/api/horas/${fila.id}`)).status).toBe(403);
    expect((await lectura.agente.get(`/api/horas?usuario_id=${tec.id}`)).status).toBe(403);
    expect(Number((await filaDe(fila.id)).horas)).toBe(1);
  });

  it('técnico: 201 / 200 / 204 en lo propio; 403 en la planilla ajena', async () => {
    const { agente } = await como('tecnico');
    const otro = await crearUsuario({ rol: 'tecnico' });
    const t = await crearTicket();
    const c = await agente.post('/api/horas').send({ fecha: hoy(), ticket_id: t.id, horas: 1 });
    expect(c.status).toBe(201);
    expect((await agente.patch(`/api/horas/${c.body.id}`).send({ horas: 2 })).status).toBe(200);
    expect((await agente.delete(`/api/horas/${c.body.id}`)).status).toBe(204);
    const ajena = await agente.get(`/api/horas?usuario_id=${otro.id}`);
    expect(ajena.status).toBe(403);
    expect(ajena.body.error.codigo).toBe('SIN_PERMISO');
  });

  it.each(['coordinacion', 'admin'] as const)(
    '%s: ve la planilla del técnico (editable false) pero no escribe en lo ajeno',
    async (rol) => {
      const { agente } = await como(rol);
      const tec = await crearUsuario({ rol: 'tecnico' });
      const t = await crearTicket();
      const fila = await crearRegistroHoras(tec.id, { ticket_id: t.id, horas: 1 });
      const ver = await agente.get(`/api/horas?usuario_id=${tec.id}`);
      expect(ver.status).toBe(200);
      expect(ver.body.editable).toBe(false);
      const patch = await agente.patch(`/api/horas/${fila.id}`).send({ horas: 5 });
      expect(patch.status).toBe(403);
      expect(patch.body.error.codigo).toBe('SIN_PERMISO');
      expect((await agente.delete(`/api/horas/${fila.id}`)).status).toBe(403);
      expect(Number((await filaDe(fila.id)).horas)).toBe(1);
      // el POST siempre registra para la sesión: no hay forma de registrar para otro
      const post = await agente
        .post('/api/horas')
        .send({ fecha: hoy(), ticket_id: t.id, horas: 1, usuario_id: tec.id });
      expect(post.status).toBe(201);
      expect(post.body.usuario_id).not.toBe(tec.id);
    },
  );
});

describe('prueba 3: usuario_id manipulado', () => {
  it('POST y PATCH ignoran usuario_id del cuerpo', async () => {
    const { agente, usuario } = await como('tecnico');
    const otro = await crearUsuario({ rol: 'tecnico' });
    const t = await crearTicket();
    const c = await agente
      .post('/api/horas')
      .send({ fecha: hoy(), ticket_id: t.id, horas: 1, usuario_id: otro.id });
    expect(c.status).toBe(201);
    expect(c.body.usuario_id).toBe(usuario.id);
    const p = await agente.patch(`/api/horas/${c.body.id}`).send({ horas: 2, usuario_id: otro.id });
    expect(p.status).toBe(200);
    expect(p.body.usuario_id).toBe(usuario.id);
    expect((await filaDe(c.body.id)).usuario_id).toBe(usuario.id);
    // un PATCH solo con usuario_id queda vacío tras descartar la clave
    expect(
      (await agente.patch(`/api/horas/${c.body.id}`).send({ usuario_id: otro.id })).status,
    ).toBe(400);
  });
});

describe('prueba 4: IDOR', () => {
  it('PATCH y DELETE de la fila de otra persona → 403 y la fila no cambia; inexistente → 404', async () => {
    const { agente } = await como('tecnico');
    const otro = await crearUsuario({ rol: 'tecnico' });
    const t = await crearTicket();
    const fila = await crearRegistroHoras(otro.id, { ticket_id: t.id, horas: 3 });
    const p = await agente.patch(`/api/horas/${fila.id}`).send({ horas: 1, fecha: desplazar(-1) });
    expect(p.status).toBe(403);
    expect(p.body.error.codigo).toBe('SIN_PERMISO');
    expect((await agente.delete(`/api/horas/${fila.id}`)).status).toBe(403);
    const despues = await filaDe(fila.id);
    expect(Number(despues.horas)).toBe(3);
    expect(despues.fecha.toISOString().slice(0, 10)).toBe(fila.fecha);
    expect((await agente.patch('/api/horas/999999').send({ horas: 1 })).status).toBe(404);
    expect((await agente.delete('/api/horas/999999')).status).toBe(404);
  });
});

describe('prueba 5: destinos', () => {
  it('entradas inconsistentes → 400; descripcion con ticket se guarda null', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const ot = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const otra = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const ajena = await crearTarea({ ot_id: otra.id });
    const f = (extra: Record<string, unknown>) =>
      agente.post('/api/horas').send({ fecha: hoy(), horas: 1, ...extra });
    expect((await f({ ticket_id: 999999 })).body.error.detalles.ticket_id).toBeDefined();
    expect((await f({ ot_id: 999999 })).body.error.detalles.ot_id).toBeDefined();
    expect((await f({ ticket_id: t.id, ot_id: ot.id })).status).toBe(400);
    expect(
      (await f({ ot_id: ot.id, tarea_id: ajena.id })).body.error.detalles.tarea_id,
    ).toBeDefined();
    expect((await f({ ticket_id: t.id, tarea_id: ajena.id })).status).toBe(400);
    expect((await f({})).status).toBe(400); // "Sin ticket" sin descripción
    const ok = await f({ ticket_id: t.id, descripcion: 'x' });
    expect(ok.status).toBe(201);
    expect(ok.body.descripcion).toBeNull();
  });
});

describe('prueba 6: OT final', () => {
  it('POST a OT cerrada o cancelada → 409 OT_CERRADA con detalles.horas y sin filas nuevas', async () => {
    const { agente } = await como('tecnico');
    for (const etapa of ['cerrada', 'cancelada'] as const) {
      const ot = await crearOt((await crearTicket()).id, { etapa });
      const antes = await nFilas();
      const r = await agente.post('/api/horas').send({ fecha: hoy(), ot_id: ot.id, horas: 1 });
      expect(r.status).toBe(409);
      expect(r.body.error.codigo).toBe('OT_CERRADA');
      expect(r.body.error.detalles.horas).toBeDefined();
      expect(await nFilas()).toBe(antes);
    }
  });

  it('PATCH horas, PATCH fecha y DELETE sobre una fila cuya OT se cerró después → 409 y nada cambia', async () => {
    const { agente, usuario } = await como('tecnico');
    const ot = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const m = await agente
      .post(`/api/ots/${ot.id}/mensajes`)
      .send({ tipo: 'seguimiento', texto: 'x', horas: 3 });
    const [fila] = await dataSource.query(`SELECT id FROM registro_horas WHERE mensaje_id = $1`, [
      m.body.id,
    ]);
    const manual = await crearRegistroHoras(usuario.id, {
      ot_id: ot.id,
      fecha: desplazar(-1),
      horas: 2,
    });
    await dataSource.query(
      `UPDATE ot SET etapa = 'cerrada', cerrada_en = now(), resumen_cierre = 'x', resolvio_ticket = false,
              estado_facturacion = 'por_facturar' WHERE id = $1`,
      [ot.id],
    );
    const antes = await nFilas();
    for (const id of [fila.id, manual.id]) {
      for (const r of [
        await agente.patch(`/api/horas/${id}`).send({ horas: 1 }),
        await agente.patch(`/api/horas/${id}`).send({ fecha: desplazar(-2) }),
        await agente.delete(`/api/horas/${id}`),
      ]) {
        expect(r.status).toBe(409);
        expect(r.body.error.codigo).toBe('OT_CERRADA');
      }
    }
    expect(await nFilas()).toBe(antes);
    expect(Number((await filaDe(fila.id)).horas)).toBe(3);
    expect(Number((await filaDe(manual.id)).horas)).toBe(2);
    const [msg] = await dataSource.query(`SELECT horas FROM mensaje WHERE id = $1`, [m.body.id]);
    expect(Number(msg.horas)).toBe(3);
  });

  it('un ticket resuelto admite horas', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket({ estado: 'resuelto' });
    const r = await agente.post('/api/horas').send({ fecha: hoy(), ticket_id: t.id, horas: 1 });
    expect(r.status).toBe(201);
  });
});

describe('prueba 7: rangos', () => {
  it('horas 0 / 0,1 / 24,25 → 400; 24 y 0,25 → 201; fecha de mañana → 400, hoy → 201; descripcion de 201 → 400', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const ot = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const enviar = (extra: Record<string, unknown>) =>
      agente.post('/api/horas').send({ fecha: hoy(), ticket_id: t.id, horas: 1, ...extra });
    for (const horas of [0, 0.1, 24.25, 25]) {
      expect((await enviar({ horas })).status, `horas ${horas}`).toBe(400);
    }
    expect((await enviar({ horas: 24 })).status).toBe(201);
    expect((await enviar({ horas: 0.25, ticket_id: null, ot_id: ot.id })).status).toBe(201);
    const futura = await enviar({ fecha: desplazar(1), ticket_id: null, ot_id: ot.id });
    expect(futura.status).toBe(400);
    expect(futura.body.error.detalles.fecha).toBeDefined();
    expect((await enviar({ ticket_id: null, descripcion: 'a'.repeat(201), horas: 1 })).status).toBe(
      400,
    );
    expect((await enviar({ ticket_id: null, descripcion: 'a'.repeat(200), horas: 1 })).status).toBe(
      201,
    );
  });
});

describe('prueba 8: celda manual única', () => {
  it('segundo POST → 409 con registro_id; otra tarea u otra descripción → 201; PATCH de fecha que choca → 409', async () => {
    const { agente, usuario } = await como('tecnico');
    const ot = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const tarea = await crearTarea({ ot_id: ot.id });
    const primera = await agente.post('/api/horas').send({ fecha: hoy(), ot_id: ot.id, horas: 1 });
    const dup = await agente.post('/api/horas').send({ fecha: hoy(), ot_id: ot.id, horas: 2 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.codigo).toBe('CONFLICTO');
    expect(dup.body.error.detalles.registro_id).toBe(primera.body.id);
    expect(
      (
        await agente
          .post('/api/horas')
          .send({ fecha: hoy(), ot_id: ot.id, tarea_id: tarea.id, horas: 1 })
      ).status,
    ).toBe(201);
    await agente.post('/api/horas').send({ fecha: hoy(), descripcion: 'A', horas: 1 });
    expect(
      (await agente.post('/api/horas').send({ fecha: hoy(), descripcion: 'B', horas: 1 })).status,
    ).toBe(201);
    const ayer = await crearRegistroHoras(usuario.id, { ot_id: ot.id, fecha: desplazar(-1) });
    const choque = await agente.patch(`/api/horas/${ayer.id}`).send({ fecha: hoy() });
    expect(choque.status).toBe(409);
    expect(choque.body.error.detalles.registro_id).toBe(primera.body.id);
  });
});

describe('prueba 16: logs sin contenido', () => {
  it('POST, PATCH y DELETE no dejan la descripción ni las horas en el logger', async () => {
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
      const usuario = await crearUsuario({ rol: 'tecnico' });
      const { agente } = await ingresarComo(
        crearApp({ comprobarBd: async () => true, logger }),
        usuario,
      );
      const c = await agente
        .post('/api/horas')
        .send({ fecha: hoy(), descripcion: 'DESCRIPCION-SECRETA-789', horas: 7.25 });
      expect(c.status).toBe(201);
      expect(
        (
          await agente
            .patch(`/api/horas/${c.body.id}`)
            .send({ horas: 6.75, descripcion: 'OTRA-SECRETA-321' })
        ).status,
      ).toBe(200);
      expect((await agente.delete(`/api/horas/${c.body.id}`)).status).toBe(204);
    } finally {
      for (const e of espias) e.mockRestore();
    }
    // Sin las marcas de tiempo: «…:36.750Z» contiene «6.75» y hacía fallar la prueba al azar.
    const todo = [...lineas, ...global].join('\n').replace(/"time":"[^"]*"/g, '');
    expect(lineas.length).toBeGreaterThan(0);
    for (const secreto of ['DESCRIPCION-SECRETA-789', 'OTRA-SECRETA-321', '7.25', '6.75']) {
      expect(todo).not.toContain(secreto);
    }
  });
});

describe('prueba 17: X-Request-Id', () => {
  it('presente en un 403 y en un 409', async () => {
    const { agente } = await como('tecnico');
    const otro = await crearUsuario({ rol: 'tecnico' });
    const t = await crearTicket();
    const ajena = await crearRegistroHoras(otro.id, { ticket_id: t.id });
    const r403 = await agente.patch(`/api/horas/${ajena.id}`).send({ horas: 1 });
    expect(r403.status).toBe(403);
    expect(r403.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    await agente.post('/api/horas').send({ fecha: hoy(), ticket_id: t.id, horas: 1 });
    const r409 = await agente.post('/api/horas').send({ fecha: hoy(), ticket_id: t.id, horas: 1 });
    expect(r409.status).toBe(409);
    expect(r409.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
