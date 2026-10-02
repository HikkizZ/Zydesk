import { NOMBRES_EVENTOS_DOMINIO, type NombreEventoDominio } from '@zydesk/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  crearMensaje,
  crearOt,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { eventosDominio } from './dominio.js';

const app = () => crearApp({ comprobarBd: async () => true });

// Registra [nombre, datos] de todos los eventos de dominio publicados durante el test.
let publicados: [NombreEventoDominio, unknown][] = [];
const oyentes: [NombreEventoDominio, (d: unknown) => void][] = [];

beforeEach(() => {
  publicados = [];
  for (const nombre of NOMBRES_EVENTOS_DOMINIO) {
    const fn = (d: unknown): void => void publicados.push([nombre, d]);
    oyentes.push([nombre, fn]);
    eventosDominio.on(nombre, fn);
  }
});
afterEach(() => {
  for (const [nombre, fn] of oyentes.splice(0)) eventosDominio.off(nombre, fn);
});

const de = (nombre: NombreEventoDominio): unknown[] =>
  publicados.filter(([n]) => n === nombre).map(([, d]) => d);
const nombres = (): string[] => publicados.map(([n]) => n);

async function admin() {
  const usuario = await crearUsuario({ rol: 'admin' });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const ticketNuevo = (extra: Record<string, unknown> = {}) => ({
  asunto: 'Error al emitir facturas',
  descripcion: null,
  cliente_id: null,
  solicitante_nombre: null,
  solicitante_correo: null,
  origen: 'externo',
  prioridad: 'media',
  categoria_id: null,
  inicio_planificado: null,
  fecha_limite: null,
  horas_estimadas: null,
  ...extra,
});

const mensaje = (extra: Record<string, unknown> = {}) => ({
  tipo: 'seguimiento',
  texto: 'Texto de prueba',
  mencionados_ids: [],
  archivo_ids: [],
  horas: null,
  ...extra,
});

describe('publicación de eventos de dominio: tickets', () => {
  it('crear: ticket.asignado con principal y otros sin el actor, y ticket.seguidor_agregado', async () => {
    const { agente, usuario } = await admin();
    const p = await crearUsuario();
    const o = await crearUsuario();
    const s = await crearUsuario();
    const r = await agente.post('/api/tickets').send(
      ticketNuevo({
        responsable_principal_id: p.id,
        responsables_ids: [o.id, usuario.id],
        seguidores_ids: [s.id, usuario.id],
      }),
    );
    expect(r.status).toBe(201);
    expect(de('ticket.asignado')).toEqual([
      { ticket_id: r.body.id, usuario_ids: [p.id, o.id], actor_id: usuario.id },
    ]);
    expect(de('ticket.seguidor_agregado')).toEqual([
      { ticket_id: r.body.id, usuario_ids: [s.id], actor_id: usuario.id },
    ]);
  });

  it('crear sin responsables ni seguidores no publica nada', async () => {
    const { agente } = await admin();
    expect((await agente.post('/api/tickets').send(ticketNuevo())).status).toBe(201);
    expect(publicados).toEqual([]);
  });

  it('responsables: solo los ids que no estaban antes; pasar de otro a principal no avisa', async () => {
    const { agente, usuario } = await admin();
    const p = await crearUsuario();
    const o = await crearUsuario();
    const n = await crearUsuario();
    const t = await crearTicket({ estado: 'en_curso', principal_id: p.id, otros_ids: [o.id] });
    const r = await agente
      .put(`/api/tickets/${t.id}/responsables`)
      .send({ principal_id: o.id, otros_ids: [p.id, n.id] });
    expect(r.status).toBe(200);
    expect(de('ticket.asignado')).toEqual([
      { ticket_id: t.id, usuario_ids: [n.id], actor_id: usuario.id },
    ]);
    publicados = [];
    const igual = await agente
      .put(`/api/tickets/${t.id}/responsables`)
      .send({ principal_id: o.id, otros_ids: [p.id, n.id] });
    expect(igual.status).toBe(200);
    expect(publicados).toEqual([]);
  });

  it('seguidores: solo los nuevos', async () => {
    const { agente, usuario } = await admin();
    const a = await crearUsuario();
    const b = await crearUsuario();
    const t = await crearTicket({ estado: 'en_curso' });
    await dataSource.query(`INSERT INTO ticket_seguidor (ticket_id, usuario_id) VALUES ($1, $2)`, [
      t.id,
      a.id,
    ]);
    const r = await agente
      .put(`/api/tickets/${t.id}/seguidores`)
      .send({ usuario_ids: [a.id, b.id] });
    expect(r.status).toBe(200);
    expect(de('ticket.seguidor_agregado')).toEqual([
      { ticket_id: t.id, usuario_ids: [b.id], actor_id: usuario.id },
    ]);
  });

  it('cambiar estado publica ticket.estado_cambiado; editar el ticket no publica nada', async () => {
    const { agente, usuario } = await admin();
    const t = await crearTicket({ estado: 'nuevo' });
    const r = await agente.post(`/api/tickets/${t.id}/cambiar-estado`).send({ estado: 'en_curso' });
    expect(r.status).toBe(200);
    expect(de('ticket.estado_cambiado')).toEqual([
      { ticket_id: t.id, estado_anterior: 'nuevo', estado: 'en_curso', actor_id: usuario.id },
    ]);
    publicados = [];
    const e = await agente.patch(`/api/tickets/${t.id}`).send({ asunto: 'Otro asunto' });
    expect(e.status).toBe(200);
    expect(publicados).toEqual([]);
  });

  it('un cambio de estado rechazado no publica nada', async () => {
    const { agente } = await admin();
    const t = await crearTicket({ estado: 'nuevo' });
    const r = await agente
      .post(`/api/tickets/${t.id}/cambiar-estado`)
      .send({ estado: 'duplicado', duplicado_de_id: 999999 });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(publicados).toEqual([]);
  });
});

describe('publicación de eventos de dominio: mensajes', () => {
  it('seguimiento con mención: mencion (sin el autor) y ticket.seguimiento_nuevo', async () => {
    const { agente, usuario } = await admin();
    const u = await crearUsuario();
    const t = await crearTicket({ estado: 'en_curso' });
    const r = await agente
      .post(`/api/tickets/${t.id}/mensajes`)
      .send(mensaje({ mencionados_ids: [u.id, usuario.id] }));
    expect(r.status).toBe(201);
    expect(de('mencion')).toEqual([
      {
        mensaje_id: r.body.id,
        ticket_id: t.id,
        ot_id: null,
        tipo: 'seguimiento',
        usuario_ids: [u.id],
        actor_id: usuario.id,
      },
    ]);
    expect(de('ticket.seguimiento_nuevo')).toEqual([
      { ticket_id: t.id, mensaje_id: r.body.id, actor_id: usuario.id, copiado: false },
    ]);
  });

  it('nota interna con mención publica solo mencion', async () => {
    const { agente } = await admin();
    const u = await crearUsuario();
    const t = await crearTicket({ estado: 'en_curso' });
    const r = await agente
      .post(`/api/tickets/${t.id}/mensajes`)
      .send(mensaje({ tipo: 'nota_interna', mencionados_ids: [u.id] }));
    expect(r.status).toBe(201);
    expect(nombres()).toEqual(['mencion']);
  });

  it('seguimiento sin menciones publica solo ticket.seguimiento_nuevo', async () => {
    const { agente } = await admin();
    const t = await crearTicket({ estado: 'en_curso' });
    await agente.post(`/api/tickets/${t.id}/mensajes`).send(mensaje());
    expect(nombres()).toEqual(['ticket.seguimiento_nuevo']);
  });

  it('menciones inválidas: la transacción falla y no se publica nada', async () => {
    const { agente } = await admin();
    const inactivo = await crearUsuario({ activo: false });
    const t = await crearTicket({ estado: 'en_curso' });
    const r = await agente
      .post(`/api/tickets/${t.id}/mensajes`)
      .send(mensaje({ mencionados_ids: [inactivo.id] }));
    expect(r.status).toBe(400);
    expect(publicados).toEqual([]);
  });

  it('mensaje de OT: solo mencion (sin seguimiento_nuevo)', async () => {
    const { agente, usuario } = await admin();
    const u = await crearUsuario();
    const t = await crearTicket({ estado: 'en_curso' });
    const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
    const r = await agente
      .post(`/api/ots/${ot.id}/mensajes`)
      .send(mensaje({ mencionados_ids: [u.id] }));
    expect(r.status).toBe(201);
    expect(nombres()).toEqual(['mencion']);
    expect(de('mencion')).toEqual([
      {
        mensaje_id: r.body.id,
        ticket_id: null,
        ot_id: ot.id,
        tipo: 'seguimiento',
        usuario_ids: [u.id],
        actor_id: usuario.id,
      },
    ]);
  });

  it('mensaje de OT con copiar_al_ticket: seguimiento_nuevo copiado con el id de la copia', async () => {
    const { agente, usuario } = await admin();
    const t = await crearTicket({ estado: 'en_curso' });
    const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
    const r = await agente
      .post(`/api/ots/${ot.id}/mensajes`)
      .send(mensaje({ copiar_al_ticket: true }));
    expect(r.status).toBe(201);
    const [copia] = await dataSource.query(`SELECT id FROM mensaje WHERE copiado_desde_id = $1`, [
      r.body.id,
    ]);
    expect(de('ticket.seguimiento_nuevo')).toEqual([
      { ticket_id: t.id, mensaje_id: copia.id, actor_id: usuario.id, copiado: true },
    ]);
  });

  it('copiar una nota al ticket no publica; copiar un seguimiento sí', async () => {
    const { agente, usuario } = await admin();
    const t = await crearTicket({ estado: 'en_curso' });
    const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
    const nota = await crearMensaje(
      { ot_id: ot.id },
      { tipo: 'nota_interna', autor_id: usuario.id },
    );
    expect((await agente.post(`/api/mensajes/${nota.id}/copiar-al-ticket`)).status).toBe(201);
    expect(publicados).toEqual([]);
    const seg = await crearMensaje({ ot_id: ot.id }, { tipo: 'seguimiento', autor_id: usuario.id });
    const r = await agente.post(`/api/mensajes/${seg.id}/copiar-al-ticket`);
    expect(r.status).toBe(201);
    expect(de('ticket.seguimiento_nuevo')).toEqual([
      { ticket_id: t.id, mensaje_id: r.body.id, actor_id: usuario.id, copiado: true },
    ]);
  });
});

describe('publicación de eventos de dominio: tareas', () => {
  it('crear tarea de ticket con responsable distinto del actor publica tarea.asignada', async () => {
    const { agente, usuario } = await admin();
    const u = await crearUsuario();
    const t = await crearTicket({ estado: 'en_curso' });
    const r = await agente
      .post(`/api/tickets/${t.id}/tareas`)
      .send({ titulo: 'Cargar CAF', responsable_id: u.id, fecha: null, horas_estimadas: null });
    expect(r.status).toBe(201);
    expect(de('tarea.asignada')).toEqual([
      { tarea_id: r.body.id, ticket_id: t.id, ot_id: null, usuario_id: u.id, actor_id: usuario.id },
    ]);
  });

  it('sin responsable o con el propio actor no publica', async () => {
    const { agente, usuario } = await admin();
    const t = await crearTicket({ estado: 'en_curso' });
    const base = { fecha: null, horas_estimadas: null };
    await agente
      .post(`/api/tickets/${t.id}/tareas`)
      .send({ titulo: 'A', responsable_id: null, ...base });
    await agente
      .post(`/api/tickets/${t.id}/tareas`)
      .send({ titulo: 'B', responsable_id: usuario.id, ...base });
    expect(publicados).toEqual([]);
  });

  it('tarea de OT con responsable publica tarea.asignada con ot_id', async () => {
    const { agente, usuario } = await admin();
    const u = await crearUsuario();
    const t = await crearTicket({ estado: 'en_curso' });
    const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
    const r = await agente
      .post(`/api/ots/${ot.id}/tareas`)
      .send({ titulo: 'Cargar CAF', responsable_id: u.id, fecha: null, horas_estimadas: null });
    expect(r.status).toBe(201);
    expect(de('tarea.asignada')).toEqual([
      {
        tarea_id: r.body.id,
        ticket_id: null,
        ot_id: ot.id,
        usuario_id: u.id,
        actor_id: usuario.id,
      },
    ]);
  });

  it('editar: cambiar el responsable a otra persona publica; quitarlo, marcar hecha o quitar la tarea no', async () => {
    const { agente, usuario } = await admin();
    const a = await crearUsuario();
    const b = await crearUsuario();
    const t = await crearTicket({ estado: 'en_curso' });
    const tarea = await crearTarea(t.id, { responsable_id: a.id });
    const r = await agente.patch(`/api/tareas/${tarea.id}`).send({ responsable_id: b.id });
    expect(r.status).toBe(200);
    expect(de('tarea.asignada')).toEqual([
      { tarea_id: tarea.id, ticket_id: t.id, ot_id: null, usuario_id: b.id, actor_id: usuario.id },
    ]);
    publicados = [];
    await agente.patch(`/api/tareas/${tarea.id}`).send({ responsable_id: null });
    await agente.patch(`/api/tareas/${tarea.id}`).send({ hecha: true });
    await agente.patch(`/api/tareas/${tarea.id}`).send({ responsable_id: usuario.id });
    expect((await agente.delete(`/api/tareas/${tarea.id}`)).status).toBe(204);
    expect(publicados).toEqual([]);
  });
});

describe('publicación de eventos de dominio: cierre de OT', () => {
  it('cerrarOt emite ot.cerrada y no ticket.estado_cambiado, ticket.asignado ni seguimiento_nuevo', async () => {
    const { agente } = await admin();
    const principal = await crearUsuario();
    const nuevo = await crearUsuario();
    const t = await crearTicket({ estado: 'en_curso', principal_id: principal.id });
    const ot = await crearOt(t.id, { tipo: 'interna', etapa: 'en_ejecucion' });
    const r = await agente.post(`/api/ots/${ot.id}/cerrar`).send({
      resolvio_ticket: false,
      resumen: 'Falta una pieza',
      siguiente: { accion: 'en_curso', responsable_id: nuevo.id },
    });
    expect(r.status).toBe(200);
    expect(nombres()).toEqual(['ot.cerrada']);
  });
});
