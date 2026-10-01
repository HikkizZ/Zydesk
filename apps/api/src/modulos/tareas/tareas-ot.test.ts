import { describe, expect, it } from 'vitest';
import {
  crearOt,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { moverTareasAbiertas } from './tareas.service.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura') {
  const usuario = await crearUsuario({ rol, nombre: `Persona ${rol}` });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const eventosOt = (id: number) =>
  dataSource.query(
    `SELECT accion, autor_id, datos FROM evento WHERE entidad = 'ot' AND entidad_id = $1 ORDER BY id`,
    [String(id)],
  );

const nEventosTicket = async (id: number): Promise<number> =>
  Number(
    (
      await dataSource.query(
        `SELECT count(*)::int AS n FROM evento WHERE entidad = 'ticket' AND entidad_id = $1`,
        [String(id)],
      )
    )[0].n,
  );

const actualizadoOt = async (id: number): Promise<number> =>
  new Date(
    (await dataSource.query(`SELECT actualizado_en FROM ot WHERE id = $1`, [id]))[0].actualizado_en,
  ).getTime();

async function otNueva(etapa: 'borrador' | 'en_ejecucion' | 'cerrada' | 'cancelada' = 'borrador') {
  const t = await crearTicket();
  const ot = await crearOt(t.id, { etapa });
  return { t, ot };
}

describe('tareas de OT', () => {
  it('POST crea con horas estimadas, orden max+1, evento en la OT y sin tocar el ticket', async () => {
    const { agente, usuario } = await como('tecnico');
    const { t, ot } = await otNueva();
    await crearTarea({ ot_id: ot.id });
    const eventosAntes = await nEventosTicket(t.id);
    const r = await agente
      .post(`/api/ots/${ot.id}/tareas`)
      .send({ titulo: 'Instalar switch', horas_estimadas: 2.5 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      ticket_id: null,
      ot_id: ot.id,
      titulo: 'Instalar switch',
      orden: 2,
      horas_estimadas: 2.5,
      horas_reales: null,
    });
    expect(await eventosOt(ot.id)).toEqual([
      {
        accion: 'tarea_creada',
        autor_id: usuario.id,
        datos: {
          tarea_id: r.body.id,
          titulo: 'Instalar switch',
          responsable: null,
          horas_estimadas: 2.5,
        },
      },
    ]);
    expect(await nEventosTicket(t.id)).toBe(eventosAntes);
    const lista = await agente.get(`/api/ots/${ot.id}/tareas`);
    expect(lista.status).toBe(200);
    expect(lista.body.map((x: { orden: number }) => x.orden)).toEqual([1, 2]);
  });

  it('POST en OT cerrada o cancelada → 409 OT_CERRADA; OT inexistente → 404; lectura → 403', async () => {
    const { agente } = await como('tecnico');
    for (const etapa of ['cerrada', 'cancelada'] as const) {
      const { ot } = await otNueva(etapa);
      const r = await agente.post(`/api/ots/${ot.id}/tareas`).send({ titulo: 'X' });
      expect(r.status).toBe(409);
      expect(r.body.error.codigo).toBe('OT_CERRADA');
    }
    expect((await agente.post('/api/ots/999999/tareas').send({ titulo: 'X' })).status).toBe(404);
    expect((await agente.get('/api/ots/999999/tareas')).status).toBe(404);
    const lectura = await como('lectura');
    const { ot } = await otNueva();
    expect(
      (await lectura.agente.post(`/api/ots/${ot.id}/tareas`).send({ titulo: 'X' })).status,
    ).toBe(403);
    expect((await lectura.agente.get(`/api/ots/${ot.id}/tareas`)).status).toBe(200);
  });

  it('horas_estimadas en una tarea de ticket → 400 (crear y editar)', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const r = await agente
      .post(`/api/tickets/${t.id}/tareas`)
      .send({ titulo: 'X', horas_estimadas: 2 });
    expect(r.status).toBe(400);
    expect(r.body.error.detalles.horas_estimadas).toEqual(['Solo en tareas de OT']);
    const tarea = await crearTarea(t.id);
    for (const cuerpo of [{ horas_estimadas: 1 }, { horas_reales: 1 }]) {
      const p = await agente.patch(`/api/tareas/${tarea.id}`).send(cuerpo);
      expect(p.status).toBe(400);
      expect(p.body.error.codigo).toBe('VALIDACION');
    }
  });

  it('PATCH de horas deja tarea_editada con cambios "3 h" → "4 h"; marcar hecha no borra horas ni responsable', async () => {
    const { agente } = await como('tecnico');
    const resp = await crearUsuario({ nombre: 'Rita Soto' });
    const { ot } = await otNueva('en_ejecucion');
    const tarea = await crearTarea(
      { ot_id: ot.id },
      { titulo: 'Cablear', horas_estimadas: 3, responsable_id: resp.id },
    );
    const r = await agente
      .patch(`/api/tareas/${tarea.id}`)
      .send({ horas_estimadas: 4, horas_reales: 1.25 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ horas_estimadas: 4, horas_reales: 1.25 });
    const eventos = await eventosOt(ot.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      accion: 'tarea_editada',
      datos: {
        titulo: 'Cablear',
        cambios: { horas_estimadas: ['3 h', '4 h'], horas_reales: [null, '1.25 h'] },
      },
    });
    const h = await agente.patch(`/api/tareas/${tarea.id}`).send({ hecha: true });
    expect(h.status).toBe(200);
    expect(h.body).toMatchObject({
      hecha: true,
      horas_estimadas: 4,
      horas_reales: 1.25,
      responsable: { id: resp.id },
    });
    expect((await eventosOt(ot.id)).map((e: { accion: string }) => e.accion)).toEqual([
      'tarea_editada',
      'tarea_hecha',
    ]);
  });

  it('prueba 11: con la OT cerrada, marcar → 200 y editar título u horas → 409 OT_CERRADA; DELETE → 409', async () => {
    const { agente } = await como('tecnico');
    const { ot } = await otNueva('cerrada');
    const tarea = await crearTarea({ ot_id: ot.id }, { titulo: 'Original', horas_estimadas: 1 });
    const marcar = await agente.patch(`/api/tareas/${tarea.id}`).send({ hecha: true });
    expect(marcar.status).toBe(200);
    expect((await agente.patch(`/api/tareas/${tarea.id}`).send({ hecha: false })).status).toBe(200);
    for (const cuerpo of [
      { titulo: 'Otro' },
      { horas_reales: 2 },
      { titulo: 'Otro', hecha: true },
    ]) {
      const r = await agente.patch(`/api/tareas/${tarea.id}`).send(cuerpo);
      expect(r.status).toBe(409);
      expect(r.body.error.codigo).toBe('OT_CERRADA');
    }
    const del = await agente.delete(`/api/tareas/${tarea.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error.codigo).toBe('OT_CERRADA');
    const [{ titulo }] = await dataSource.query(`SELECT titulo FROM tarea WHERE id = $1`, [
      tarea.id,
    ]);
    expect(titulo).toBe('Original');
  });

  it('DELETE de una tarea de OT: 204, evento tarea_quitada en la OT y actualiza la OT', async () => {
    const { agente } = await como('tecnico');
    const { ot } = await otNueva();
    const tarea = await crearTarea({ ot_id: ot.id }, { titulo: 'Quitar' });
    await dataSource.query(`UPDATE ot SET actualizado_en = '2020-01-01' WHERE id = $1`, [ot.id]);
    const r = await agente.delete(`/api/tareas/${tarea.id}`);
    expect(r.status).toBe(204);
    expect((await eventosOt(ot.id)).map((e: { accion: string }) => e.accion)).toEqual([
      'tarea_quitada',
    ]);
    expect(await actualizadoOt(ot.id)).toBeGreaterThan(new Date('2020-01-02').getTime());
  });
});

describe('moverTareasAbiertas', () => {
  it('ticket → OT: mueve solo las no hechas conservando el orden; las hechas se quedan', async () => {
    const { t, ot } = await otNueva();
    const hecha = await crearTarea(t.id, { titulo: 'Hecha', hecha: true });
    const a = await crearTarea(t.id, { titulo: 'A' });
    const b = await crearTarea(t.id, { titulo: 'B' });
    const movidas = await enTransaccion((tx) =>
      moverTareasAbiertas(tx, { ticket_id: t.id }, { ot_id: ot.id }),
    );
    expect(movidas).toEqual([
      { id: a.id, titulo: 'A' },
      { id: b.id, titulo: 'B' },
    ]);
    const filas = await dataSource.query(
      `SELECT id, ticket_id, ot_id, orden FROM tarea WHERE id = ANY($1) ORDER BY id`,
      [[hecha.id, a.id, b.id]],
    );
    expect(filas).toEqual([
      { id: hecha.id, ticket_id: t.id, ot_id: null, orden: 1 },
      { id: a.id, ticket_id: null, ot_id: ot.id, orden: 1 },
      { id: b.id, ticket_id: null, ot_id: ot.id, orden: 2 },
    ]);
  });

  it('OT → OT: añade después de las que ya tiene y conserva horas; sin abiertas devuelve []', async () => {
    const { t, ot: origen } = await otNueva('en_ejecucion');
    const destino = await crearOt(t.id, { etapa: 'borrador' });
    await crearTarea({ ot_id: destino.id }, { titulo: 'Previa' });
    await crearTarea({ ot_id: origen.id }, { titulo: 'Hecha', hecha: true });
    const pendiente = await crearTarea(
      { ot_id: origen.id },
      { titulo: 'Pendiente', horas_estimadas: 2 },
    );
    const movidas = await enTransaccion((tx) =>
      moverTareasAbiertas(tx, { ot_id: origen.id }, { ot_id: destino.id }),
    );
    expect(movidas).toEqual([{ id: pendiente.id, titulo: 'Pendiente' }]);
    const [f] = await dataSource.query(
      `SELECT ot_id, orden, horas_estimadas::float8 AS h FROM tarea WHERE id = $1`,
      [pendiente.id],
    );
    expect(f).toEqual({ ot_id: destino.id, orden: 2, h: 2 });
    const vacio = await enTransaccion((tx) =>
      moverTareasAbiertas(tx, { ot_id: origen.id }, { ot_id: destino.id }),
    );
    expect(vacio).toEqual([]);
  });
});
