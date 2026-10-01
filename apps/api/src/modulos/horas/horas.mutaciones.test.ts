import type { Rol } from '@zydesk/shared';
import { describe, expect, it } from 'vitest';
import {
  crearMensaje,
  crearOt,
  crearRegistroHoras,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

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
const ayer = (): string => desplazar(-1);
const manana = (): string => desplazar(1);

const filaDe = async (id: number) =>
  (await dataSource.query(`SELECT * FROM registro_horas WHERE id = $1`, [id]))[0];
const nFilas = async (): Promise<number> =>
  Number((await dataSource.query(`SELECT count(*)::int AS n FROM registro_horas`))[0].n);

describe('POST /api/horas', () => {
  it('crea una fila manual de la sesión en un ticket, una OT con tarea y "Sin ticket"', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket();
    const ot = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const tarea = await crearTarea({ ot_id: ot.id });
    const a = await agente.post('/api/horas').send({ fecha: hoy(), ticket_id: t.id, horas: 1.5 });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({
      usuario_id: usuario.id,
      ticket_id: t.id,
      ot_id: null,
      tarea_id: null,
      mensaje_id: null,
      descripcion: null,
      horas: 1.5,
      fuera_de_horario: false,
    });
    const b = await agente
      .post('/api/horas')
      .send({ fecha: hoy(), ot_id: ot.id, tarea_id: tarea.id, horas: 2, fuera_de_horario: true });
    expect(b.status).toBe(201);
    expect(b.body).toMatchObject({ ot_id: ot.id, tarea_id: tarea.id, fuera_de_horario: true });
    const c = await agente
      .post('/api/horas')
      .send({ fecha: hoy(), descripcion: '  Reunión  ', horas: 1 });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ ticket_id: null, ot_id: null, descripcion: 'Reunión' });
  });

  it('con ticket u OT la descripción se guarda null', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const r = await agente
      .post('/api/horas')
      .send({ fecha: hoy(), ticket_id: t.id, horas: 1, descripcion: 'ignorada' });
    expect(r.status).toBe(201);
    expect(r.body.descripcion).toBeNull();
  });

  it('no actualiza actualizado_en del ticket ni de la OT', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket({ actualizado_en: new Date('2020-01-01T00:00:00Z') });
    const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
    await dataSource.query(`UPDATE ot SET actualizado_en = '2020-01-01' WHERE id = $1`, [ot.id]);
    await agente.post('/api/horas').send({ fecha: hoy(), ticket_id: t.id, horas: 1 });
    await agente.post('/api/horas').send({ fecha: hoy(), ot_id: ot.id, horas: 1 });
    const [tk] = await dataSource.query(`SELECT actualizado_en FROM ticket WHERE id = $1`, [t.id]);
    const [o] = await dataSource.query(`SELECT actualizado_en FROM ot WHERE id = $1`, [ot.id]);
    expect(new Date(tk.actualizado_en).getFullYear()).toBe(2020);
    expect(new Date(o.actualizado_en).getFullYear()).toBe(2020);
  });

  it('celda manual duplicada → 409 CONFLICTO con registro_id; otra tarea u otra descripción es otra celda', async () => {
    const { agente } = await como('tecnico');
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
    expect(
      (await agente.post('/api/horas').send({ fecha: hoy(), descripcion: 'A', horas: 1 })).status,
    ).toBe(409);
  });

  it('una fila de seguimiento en la celda no impide crear la manual', async () => {
    const { agente, usuario } = await como('tecnico');
    const ot = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const m = await crearMensaje({ ot_id: ot.id }, { autor_id: usuario.id, horas: 3 });
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, mensaje_id: m.id, horas: 3 });
    expect(
      (await agente.post('/api/horas').send({ fecha: hoy(), ot_id: ot.id, horas: 1 })).status,
    ).toBe(201);
  });

  it('destino inexistente o tarea ajena → 400; fecha futura → 400; OT final → 409 OT_CERRADA', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const ot = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const otra = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const ajena = await crearTarea({ ot_id: otra.id });
    const f = (extra: Record<string, unknown>) =>
      agente.post('/api/horas').send({ fecha: hoy(), horas: 1, ...extra });
    const sin = await f({ ticket_id: 999999 });
    expect(sin.status).toBe(400);
    expect(sin.body.error.detalles.ticket_id).toBeDefined();
    const sinOt = await f({ ot_id: 999999 });
    expect(sinOt.status).toBe(400);
    expect(sinOt.body.error.detalles.ot_id).toBeDefined();
    const tarea = await f({ ot_id: ot.id, tarea_id: ajena.id });
    expect(tarea.status).toBe(400);
    expect(tarea.body.error.detalles.tarea_id).toBeDefined();
    const fut = await f({ ticket_id: t.id, fecha: manana() });
    expect(fut.status).toBe(400);
    expect(fut.body.error.detalles.fecha).toBeDefined();
    for (const etapa of ['cerrada', 'cancelada'] as const) {
      const final = await crearOt((await crearTicket()).id, { etapa });
      const antes = await nFilas();
      const r = await f({ ot_id: final.id });
      expect(r.status).toBe(409);
      expect(r.body.error.codigo).toBe('OT_CERRADA');
      expect(r.body.error.detalles.horas).toEqual(['No se registran horas en una OT cerrada']);
      expect(await nFilas()).toBe(antes);
    }
    // un ticket cerrado sí admite horas
    const cerrado = await crearTicket({ estado: 'resuelto' });
    expect((await f({ ticket_id: cerrado.id })).status).toBe(201);
  });
});

describe('PATCH y DELETE /api/horas/:id', () => {
  it('edita horas, fecha, fuera de horario y descripción (solo Sin ticket)', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket();
    const fila = await crearRegistroHoras(usuario.id, { ticket_id: t.id, fecha: hoy() });
    const r = await agente
      .patch(`/api/horas/${fila.id}`)
      .send({ horas: 2.5, fecha: ayer(), fuera_de_horario: true, descripcion: 'no aplica' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: fila.id,
      horas: 2.5,
      fecha: ayer(),
      fuera_de_horario: true,
      descripcion: null,
    });
    const sin = await crearRegistroHoras(usuario.id, { descripcion: 'Antes', fecha: hoy() });
    const s = await agente.patch(`/api/horas/${sin.id}`).send({ descripcion: 'Después' });
    expect(s.body.descripcion).toBe('Después');
    // "Sin ticket" no puede quedar sin descripción ni tomar tarea; una fila de ticket tampoco
    expect((await agente.patch(`/api/horas/${sin.id}`).send({ descripcion: null })).status).toBe(
      400,
    );
    expect((await agente.patch(`/api/horas/${sin.id}`).send({ tarea_id: 1 })).status).toBe(400);
    expect((await agente.patch(`/api/horas/${fila.id}`).send({ tarea_id: 1 })).status).toBe(400);
  });

  it('cambia la tarea dentro de la OT; de otra OT → 400; sin cambios o con ot_id → 400', async () => {
    const { agente, usuario } = await como('tecnico');
    const ot = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const otra = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const ta = await crearTarea({ ot_id: ot.id });
    const ajena = await crearTarea({ ot_id: otra.id });
    const fila = await crearRegistroHoras(usuario.id, { ot_id: ot.id, fecha: hoy() });
    const ok = await agente.patch(`/api/horas/${fila.id}`).send({ tarea_id: ta.id });
    expect(ok.body.tarea_id).toBe(ta.id);
    const mala = await agente.patch(`/api/horas/${fila.id}`).send({ tarea_id: ajena.id });
    expect(mala.status).toBe(400);
    expect(mala.body.error.detalles.tarea_id).toBeDefined();
    expect((await agente.patch(`/api/horas/${fila.id}`).send({})).status).toBe(400);
    expect((await agente.patch(`/api/horas/${fila.id}`).send({ ot_id: ot.id })).status).toBe(400);
    const quitar = await agente.patch(`/api/horas/${fila.id}`).send({ tarea_id: null });
    expect(quitar.body.tarea_id).toBeNull();
  });

  it('fecha futura → 400; fecha que choca con otra fila manual → 409', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket();
    const hoyFila = await crearRegistroHoras(usuario.id, { ticket_id: t.id, fecha: hoy() });
    const ayerFila = await crearRegistroHoras(usuario.id, { ticket_id: t.id, fecha: ayer() });
    const fut = await agente.patch(`/api/horas/${hoyFila.id}`).send({ fecha: manana() });
    expect(fut.status).toBe(400);
    expect(fut.body.error.detalles.fecha).toBeDefined();
    const choque = await agente.patch(`/api/horas/${hoyFila.id}`).send({ fecha: ayer() });
    expect(choque.status).toBe(409);
    expect(choque.body.error.codigo).toBe('CONFLICTO');
    expect(choque.body.error.detalles.registro_id).toBe(ayerFila.id);
    // sin cambio de celda no choca consigo misma
    expect((await agente.patch(`/api/horas/${ayerFila.id}`).send({ horas: 4 })).status).toBe(200);
  });

  it('inexistente → 404; DELETE borra y devuelve 204', async () => {
    const { agente, usuario } = await como('tecnico');
    expect((await agente.patch('/api/horas/999999').send({ horas: 1 })).status).toBe(404);
    expect((await agente.delete('/api/horas/999999')).status).toBe(404);
    const t = await crearTicket();
    const fila = await crearRegistroHoras(usuario.id, { ticket_id: t.id });
    const r = await agente.delete(`/api/horas/${fila.id}`);
    expect(r.status).toBe(204);
    expect(await filaDe(fila.id)).toBeUndefined();
  });

  it('sincroniza mensaje.horas: editar → mismo valor; borrar → NULL; fecha y fuera de horario no lo tocan', async () => {
    const { agente } = await como('tecnico');
    const ot = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const m = await agente
      .post(`/api/ots/${ot.id}/mensajes`)
      .send({ tipo: 'seguimiento', texto: 'Trabajo hecho', horas: 3 });
    expect(m.status).toBe(201);
    const [fila] = await dataSource.query(`SELECT id FROM registro_horas WHERE mensaje_id = $1`, [
      m.body.id,
    ]);
    const mensaje = async () =>
      (await dataSource.query(`SELECT horas, texto FROM mensaje WHERE id = $1`, [m.body.id]))[0];
    expect((await agente.patch(`/api/horas/${fila.id}`).send({ horas: 2.5 })).status).toBe(200);
    expect(Number((await mensaje()).horas)).toBe(2.5);
    await agente.patch(`/api/horas/${fila.id}`).send({ fecha: ayer(), fuera_de_horario: true });
    expect(Number((await mensaje()).horas)).toBe(2.5);

    const planilla = await agente.get(`/api/horas?semana=${ayer()}`);
    const celdas = planilla.body.filas.flatMap((f: { celdas: { registros: unknown[] }[] }) =>
      f.celdas.flatMap((c) => c.registros),
    ) as { id: number; mensaje: unknown }[];
    expect(celdas.find((r) => r.id === fila.id)?.mensaje).toEqual({
      id: m.body.id,
      tipo: 'seguimiento',
    });

    expect((await agente.delete(`/api/horas/${fila.id}`)).status).toBe(204);
    const despues = await mensaje();
    expect(despues.horas).toBeNull();
    expect(despues.texto).toBe('Trabajo hecho');
  });

  it('texto con HTML se guarda y devuelve literal', async () => {
    const { agente } = await como('tecnico');
    const peligro = '<img src=x onerror=alert(1)>';
    const r = await agente
      .post('/api/horas')
      .send({ fecha: hoy(), descripcion: peligro, horas: 1 });
    expect(r.body.descripcion).toBe(peligro);
    const p = await agente.get('/api/horas');
    expect(p.body.filas[0].destino.descripcion).toBe(peligro);
  });
});
