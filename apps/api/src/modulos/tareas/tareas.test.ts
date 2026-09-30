import { describe, expect, it } from 'vitest';
import { crearTarea, crearTicket, crearUsuario, ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura') {
  const usuario = await crearUsuario({ rol, nombre: `Persona ${rol}` });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const eventos = (id: number) =>
  dataSource.query(
    `SELECT accion, autor_id, datos FROM evento WHERE entidad = 'ticket' AND entidad_id = $1 ORDER BY id`,
    [String(id)],
  );

const actualizadoEn = async (id: number): Promise<number> =>
  new Date(
    (await dataSource.query(`SELECT actualizado_en FROM ticket WHERE id = $1`, [id]))[0]
      .actualizado_en,
  ).getTime();

const VIEJO = new Date('2020-01-01T00:00:00Z');

describe('POST /api/tickets/:id/tareas', () => {
  it('crea con orden max+1, evento tarea_creada en el ticket y actualiza el ticket', async () => {
    const { agente, usuario } = await como('tecnico');
    const resp = await crearUsuario({ nombre: 'Rita Soto' });
    const t = await crearTicket({ actualizado_en: VIEJO });
    await crearTarea(t.id); // orden 1
    const r = await agente
      .post(`/api/tickets/${t.id}/tareas`)
      .send({ titulo: 'Llamar al cliente', responsable_id: resp.id, fecha: '2030-05-01' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      ticket_id: t.id,
      titulo: 'Llamar al cliente',
      fecha: '2030-05-01',
      hecha: false,
      hecha_en: null,
      orden: 2,
      vencida: false,
      responsable: { id: resp.id, nombre: 'Rita Soto' },
    });
    expect(await eventos(t.id)).toEqual([
      {
        accion: 'tarea_creada',
        autor_id: usuario.id,
        datos: { tarea_id: r.body.id, titulo: 'Llamar al cliente', responsable: 'Rita Soto' },
      },
    ]);
    expect(await actualizadoEn(t.id)).toBeGreaterThan(VIEJO.getTime());
    const [{ creado_por }] = await dataSource.query(`SELECT creado_por FROM tarea WHERE id = $1`, [
      r.body.id,
    ]);
    expect(creado_por).toBe(usuario.id);
  });

  it('marca vencida si la fecha ya pasó y no está hecha', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const r = await agente
      .post(`/api/tickets/${t.id}/tareas`)
      .send({ titulo: 'Atrasada', fecha: '2020-01-01' });
    expect(r.body.vencida).toBe(true);
  });

  it('valida: título vacío, fecha inválida y responsable inexistente o inactivo → 400', async () => {
    const { agente } = await como('tecnico');
    const inactivo = await crearUsuario({ activo: false });
    const t = await crearTicket();
    for (const mal of [
      { titulo: ' ' },
      { titulo: 'x', fecha: '2030-13-45' },
      { titulo: 'x', responsable_id: inactivo.id },
      { titulo: 'x', responsable_id: 999999 },
    ]) {
      const r = await agente.post(`/api/tickets/${t.id}/tareas`).send(mal);
      expect(r.status, JSON.stringify(mal)).toBe(400);
    }
    expect(await dataSource.query(`SELECT 1 FROM tarea`)).toEqual([]);
    expect(await eventos(t.id)).toEqual([]);
  });

  it('prueba 9: ticket cerrado → 409 TICKET_CERRADO', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket({ estado: 'resuelto' });
    const r = await agente.post(`/api/tickets/${t.id}/tareas`).send({ titulo: 'x' });
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TICKET_CERRADO');
    expect(await dataSource.query(`SELECT 1 FROM tarea`)).toEqual([]);
  });

  it('ticket inexistente → 404; lectura → 403 sin rastro; sin sesión → 401', async () => {
    const { agente: tec } = await como('tecnico');
    expect((await tec.post('/api/tickets/999999/tareas').send({ titulo: 'x' })).status).toBe(404);
    expect((await tec.get('/api/tickets/999999/tareas')).status).toBe(404);
    const { agente } = await como('lectura');
    const t = await crearTicket();
    const r = await agente.post(`/api/tickets/${t.id}/tareas`).send({ titulo: 'x' });
    expect(r.status).toBe(403);
    expect(await dataSource.query(`SELECT 1 FROM tarea`)).toEqual([]);
    expect(await eventos(t.id)).toEqual([]);
    const { default: request } = await import('supertest');
    const sin = await request(app())
      .post(`/api/tickets/${t.id}/tareas`)
      .set('X-Requested-With', 'Zydesk')
      .send({ titulo: 'x' });
    expect(sin.status).toBe(401);
  });
});

describe('GET /api/tickets/:id/tareas', () => {
  it('lista por orden; lectura puede leer y no escribe', async () => {
    const { agente } = await como('lectura');
    const t = await crearTicket({ actualizado_en: VIEJO });
    const a = await crearTarea(t.id, { titulo: 'A' });
    const b = await crearTarea(t.id, { titulo: 'B', hecha: true });
    const r = await agente.get(`/api/tickets/${t.id}/tareas`);
    expect(r.status).toBe(200);
    expect(r.body.map((x: { id: number }) => x.id)).toEqual([a.id, b.id]);
    expect(r.body[1]).toMatchObject({ hecha: true });
    expect(r.body[1].hecha_en).not.toBeNull();
    expect(await eventos(t.id)).toEqual([]);
    expect(await actualizadoEn(t.id)).toBe(VIEJO.getTime());
  });
});

describe('PATCH /api/tareas/:id', () => {
  it('hecha:true fija hecha_en y deja tarea_hecha; hecha:false lo limpia y deja tarea_reabierta', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const tarea = await crearTarea(t.id, { titulo: 'Instalar parche' });
    const r1 = await agente.patch(`/api/tareas/${tarea.id}`).send({ hecha: true });
    expect(r1.status).toBe(200);
    expect(r1.body.hecha).toBe(true);
    expect(r1.body.hecha_en).not.toBeNull();
    const r2 = await agente.patch(`/api/tareas/${tarea.id}`).send({ hecha: false });
    expect(r2.body).toMatchObject({ hecha: false, hecha_en: null });
    expect((await eventos(t.id)).map((e: { accion: string }) => e.accion)).toEqual([
      'tarea_hecha',
      'tarea_reabierta',
    ]);
    expect((await eventos(t.id))[0].datos).toEqual({
      tarea_id: tarea.id,
      titulo: 'Instalar parche',
    });
  });

  it('editar título/responsable/fecha deja tarea_editada con cambios [antes, después]', async () => {
    const { agente } = await como('tecnico');
    const resp = await crearUsuario({ nombre: 'Rita Soto' });
    const t = await crearTicket();
    const tarea = await crearTarea(t.id, { titulo: 'Viejo', fecha: '2030-01-01' });
    const r = await agente
      .patch(`/api/tareas/${tarea.id}`)
      .send({ titulo: 'Nuevo', responsable_id: resp.id, fecha: null });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ titulo: 'Nuevo', fecha: null, responsable: { id: resp.id } });
    const ev = await eventos(t.id);
    expect(ev).toHaveLength(1);
    expect(ev[0].accion).toBe('tarea_editada');
    expect(ev[0].datos).toEqual({
      tarea_id: tarea.id,
      titulo: 'Nuevo',
      cambios: {
        titulo: ['Viejo', 'Nuevo'],
        responsable: [null, 'Rita Soto'],
        fecha: ['2030-01-01', null],
      },
    });
  });

  it('sin cambios reales no escribe ni deja evento', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket({ actualizado_en: VIEJO });
    const tarea = await crearTarea(t.id, { titulo: 'Igual' });
    const r = await agente.patch(`/api/tareas/${tarea.id}`).send({ titulo: 'Igual', hecha: false });
    expect(r.status).toBe(200);
    expect(await eventos(t.id)).toEqual([]);
    expect(await actualizadoEn(t.id)).toBe(VIEJO.getTime());
  });

  it('prueba 9 / T12: en ticket cerrado marcar → 200 y editar título → 409 sin cambios', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket({ estado: 'resuelto' });
    const tarea = await crearTarea(t.id, { titulo: 'Original' });
    const marcar = await agente.patch(`/api/tareas/${tarea.id}`).send({ hecha: true });
    expect(marcar.status).toBe(200);
    expect(marcar.body.hecha).toBe(true);
    const desmarcar = await agente.patch(`/api/tareas/${tarea.id}`).send({ hecha: false });
    expect(desmarcar.status).toBe(200);

    const editar = await agente.patch(`/api/tareas/${tarea.id}`).send({ titulo: 'Otro' });
    expect(editar.status).toBe(409);
    expect(editar.body.error.codigo).toBe('TICKET_CERRADO');
    // edición + marcar en la misma petición: rechazada entera
    const mixto = await agente
      .patch(`/api/tareas/${tarea.id}`)
      .send({ titulo: 'Otro', hecha: true });
    expect(mixto.status).toBe(409);
    const [f] = await dataSource.query(`SELECT titulo, hecha FROM tarea WHERE id = $1`, [tarea.id]);
    expect(f).toEqual({ titulo: 'Original', hecha: false });
  });

  it('responsable inactivo → 400; tarea inexistente → 404; lectura → 403', async () => {
    const { agente } = await como('tecnico');
    const inactivo = await crearUsuario({ activo: false });
    const t = await crearTicket();
    const tarea = await crearTarea(t.id);
    const r = await agente.patch(`/api/tareas/${tarea.id}`).send({ responsable_id: inactivo.id });
    expect(r.status).toBe(400);
    expect((await agente.patch('/api/tareas/999999').send({ hecha: true })).status).toBe(404);
    const { agente: lector } = await como('lectura');
    expect((await lector.patch(`/api/tareas/${tarea.id}`).send({ hecha: true })).status).toBe(403);
    expect((await lector.delete(`/api/tareas/${tarea.id}`)).status).toBe(403);
    expect(await eventos(t.id)).toEqual([]);
  });
});

describe('DELETE /api/tareas/:id', () => {
  it('borra, deja tarea_quitada y actualiza el ticket', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket({ actualizado_en: VIEJO });
    const tarea = await crearTarea(t.id, { titulo: 'Sobra' });
    const r = await agente.delete(`/api/tareas/${tarea.id}`);
    expect(r.status).toBe(204);
    expect(await dataSource.query(`SELECT 1 FROM tarea`)).toEqual([]);
    const ev = await eventos(t.id);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      accion: 'tarea_quitada',
      datos: { tarea_id: tarea.id, titulo: 'Sobra' },
    });
    expect(await actualizadoEn(t.id)).toBeGreaterThan(VIEJO.getTime());
    expect((await agente.delete(`/api/tareas/${tarea.id}`)).status).toBe(404);
  });

  it('prueba 9: ticket cerrado → 409 y la tarea sigue', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket({ estado: 'resuelto' });
    const tarea = await crearTarea(t.id);
    const r = await agente.delete(`/api/tareas/${tarea.id}`);
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TICKET_CERRADO');
    expect(await dataSource.query(`SELECT 1 FROM tarea`)).toHaveLength(1);
  });
});
