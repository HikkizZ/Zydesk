import { describe, expect, it } from 'vitest';
import {
  crearArchivoPendiente,
  crearMensaje,
  crearOt,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura') {
  const usuario = await crearUsuario({ rol, nombre: `Persona ${rol}` });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  tipo: 'seguimiento',
  texto: 'Se instaló el equipo',
  ...extra,
});

async function otNueva(
  etapa: 'borrador' | 'en_ejecucion' | 'cerrada' | 'cancelada' = 'en_ejecucion',
) {
  const t = await crearTicket({ actualizado_en: new Date('2020-01-01T00:00:00Z') });
  const ot = await crearOt(t.id, { etapa });
  return { t, ot };
}

const cuenta = async (sql: string, args: unknown[]): Promise<number> =>
  Number((await dataSource.query(sql, args))[0].n);

const nEventos = (entidad: 'ot' | 'ticket', id: number) =>
  cuenta(`SELECT count(*)::int AS n FROM evento WHERE entidad = $1 AND entidad_id = $2`, [
    entidad,
    String(id),
  ]);

describe('POST /api/ots/:id/mensajes', () => {
  it('crea en la OT: ot_id, sin ticket_id, sin evento, actualiza la OT y no toca el ticket', async () => {
    const { agente, usuario } = await como('tecnico');
    const { t, ot } = await otNueva();
    await dataSource.query(`UPDATE ot SET actualizado_en = '2020-01-01' WHERE id = $1`, [ot.id]);
    const r = await agente.post(`/api/ots/${ot.id}/mensajes`).send(cuerpo());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      ticket_id: null,
      ot_id: ot.id,
      tipo: 'seguimiento',
      autor: { id: usuario.id },
      copiado_de: null,
      copiado_al_ticket: false,
    });
    expect(await nEventos('ot', ot.id)).toBe(0);
    expect(await nEventos('ticket', t.id)).toBe(0);
    const [{ actualizado_en }] = await dataSource.query(
      `SELECT actualizado_en FROM ot WHERE id = $1`,
      [ot.id],
    );
    expect(new Date(actualizado_en).getFullYear()).toBeGreaterThan(2020);
    const [tk] = await dataSource.query(
      `SELECT actualizado_en, primera_respuesta_en FROM ticket WHERE id = $1`,
      [t.id],
    );
    expect(new Date(tk.actualizado_en).getFullYear()).toBe(2020);
    expect(tk.primera_respuesta_en).toBeNull();
  });

  it('se permite con la OT cerrada; OT inexistente → 404; lectura → 403', async () => {
    const { agente } = await como('tecnico');
    const { ot } = await otNueva('cerrada');
    expect((await agente.post(`/api/ots/${ot.id}/mensajes`).send(cuerpo())).status).toBe(201);
    expect((await agente.post('/api/ots/999999/mensajes').send(cuerpo())).status).toBe(404);
    const lectura = await como('lectura');
    expect((await lectura.agente.post(`/api/ots/${ot.id}/mensajes`).send(cuerpo())).status).toBe(
      403,
    );
    expect((await lectura.agente.get(`/api/ots/${ot.id}/mensajes`)).status).toBe(200);
  });

  it('T7: horas en un seguimiento de OT → registro_horas con ot_id y ticket_id NULL', async () => {
    const { agente, usuario } = await como('tecnico');
    const { ot } = await otNueva();
    const r = await agente.post(`/api/ots/${ot.id}/mensajes`).send(cuerpo({ horas: 3 }));
    expect(r.status).toBe(201);
    const filas = await dataSource.query(
      `SELECT usuario_id, ot_id, ticket_id, mensaje_id, horas::float8 AS horas FROM registro_horas`,
    );
    expect(filas).toEqual([
      { usuario_id: usuario.id, ot_id: ot.id, ticket_id: null, mensaje_id: r.body.id, horas: 3 },
    ]);
  });

  it('menciones y archivos propios del mensaje; archivo ajeno → 400 y revierte', async () => {
    const { agente, usuario } = await como('tecnico');
    const ana = await crearUsuario({ nombre: 'Ana Mena' });
    const { ot } = await otNueva();
    const ajeno = await crearArchivoPendiente((await crearUsuario()).id);
    const malo = await agente
      .post(`/api/ots/${ot.id}/mensajes`)
      .send(cuerpo({ archivo_ids: [ajeno.id] }));
    expect(malo.status).toBe(400);
    expect(await cuenta(`SELECT count(*)::int AS n FROM mensaje WHERE ot_id = $1`, [ot.id])).toBe(
      0,
    );

    const propio = await crearArchivoPendiente(usuario.id, {
      nombre: 'foto.png',
      tipo_mime: 'image/png',
    });
    const r = await agente
      .post(`/api/ots/${ot.id}/mensajes`)
      .send(cuerpo({ archivo_ids: [propio.id], mencionados_ids: [ana.id] }));
    expect(r.status).toBe(201);
    expect(r.body.archivos[0]).toMatchObject({ id: propio.id, nombre_original: 'foto.png' });
    expect(r.body.mencionados[0]).toMatchObject({ id: ana.id });
    const [a] = await dataSource.query(
      `SELECT entidad, entidad_id, mensaje_id FROM archivo WHERE id = $1`,
      [propio.id],
    );
    expect(a).toEqual({ entidad: 'ot', entidad_id: ot.id, mensaje_id: r.body.id });
  });
});

describe('copiar al ticket', () => {
  it('prueba 12: copiar_al_ticket crea las dos filas; archivos desde el origen sin filas nuevas; segundo copiar → 409', async () => {
    const { agente, usuario } = await como('tecnico');
    const { t, ot } = await otNueva();
    const propio = await crearArchivoPendiente(usuario.id, {
      nombre: 'acta.pdf',
      tipo_mime: 'application/pdf',
    });
    const antesArchivos = await cuenta(`SELECT count(*)::int AS n FROM archivo`, []);
    const r = await agente
      .post(`/api/ots/${ot.id}/mensajes`)
      .send(cuerpo({ copiar_al_ticket: true, horas: 2, archivo_ids: [propio.id] }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ ot_id: ot.id, copiado_al_ticket: true });

    const [copia] = await dataSource.query(
      `SELECT id, ticket_id, ot_id, tipo, texto, autor_id, horas, copiado_desde_id FROM mensaje WHERE ticket_id = $1`,
      [t.id],
    );
    expect(copia).toMatchObject({
      ot_id: null,
      tipo: 'seguimiento',
      texto: 'Se instaló el equipo',
      autor_id: usuario.id,
      horas: null,
      copiado_desde_id: r.body.id,
    });
    expect(await cuenta(`SELECT count(*)::int AS n FROM archivo`, [])).toBe(antesArchivos);
    expect(await cuenta(`SELECT count(*)::int AS n FROM registro_horas`, [])).toBe(1);
    expect(
      await cuenta(`SELECT count(*)::int AS n FROM mencion WHERE mensaje_id = $1`, [copia.id]),
    ).toBe(0);

    const act = await agente.get(`/api/tickets/${t.id}/actividad`);
    const m = act.body.items.find(
      (i: { tipo: string; mensaje?: { id: number } }) =>
        i.tipo === 'mensaje' && i.mensaje?.id === copia.id,
    ).mensaje;
    expect(m).toMatchObject({
      ticket_id: t.id,
      ot_id: null,
      copiado_de: { mensaje_id: r.body.id, ot: { id: ot.id, codigo: ot.codigo } },
      copiado_al_ticket: false,
      mencionados: [],
    });
    expect(m.archivos).toHaveLength(1);
    expect(m.archivos[0]).toMatchObject({ id: propio.id, nombre_original: 'acta.pdf' });

    const ev = await dataSource.query(
      `SELECT accion, datos FROM evento WHERE entidad = 'ticket' AND entidad_id = $1`,
      [String(t.id)],
    );
    expect(ev).toEqual([
      {
        accion: 'seguimiento_copiado',
        datos: {
          mensaje_id: copia.id,
          desde_mensaje_id: r.body.id,
          ot_id: ot.id,
          codigo: ot.codigo,
        },
      },
    ]);
    expect((await ticketFila(t.id)).primera_respuesta_en).not.toBeNull();

    const otra = await agente.post(`/api/mensajes/${r.body.id}/copiar-al-ticket`);
    expect(otra.status).toBe(409);
    expect(otra.body.error.codigo).toBe('MENSAJE_YA_COPIADO');
    expect(
      await cuenta(`SELECT count(*)::int AS n FROM mensaje WHERE ticket_id = $1`, [t.id]),
    ).toBe(1);
  });

  it('POST /api/mensajes/:id/copiar-al-ticket copia una nota interna con el mismo tipo (201)', async () => {
    const { agente, usuario } = await como('tecnico');
    const { t, ot } = await otNueva('cerrada');
    const nota = await crearMensaje(
      { ot_id: ot.id },
      { tipo: 'nota_interna', autor_id: usuario.id, texto: 'Privado' },
    );
    const r = await agente.post(`/api/mensajes/${nota.id}/copiar-al-ticket`);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      ticket_id: t.id,
      ot_id: null,
      tipo: 'nota_interna',
      texto: 'Privado',
      copiado_de: { mensaje_id: nota.id, ot: { codigo: ot.codigo } },
    });
    // una nota no fija primera respuesta
    expect((await ticketFila(t.id)).primera_respuesta_en).toBeNull();
    const lista = await agente.get(`/api/ots/${ot.id}/mensajes`);
    expect(lista.body[0]).toMatchObject({ id: nota.id, copiado_al_ticket: true });
  });

  it('404 si el mensaje no es de una OT o no existe; lectura → 403', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket();
    const deTicket = await crearMensaje(t.id, { autor_id: usuario.id });
    expect((await agente.post(`/api/mensajes/${deTicket.id}/copiar-al-ticket`)).status).toBe(404);
    expect((await agente.post('/api/mensajes/999999/copiar-al-ticket')).status).toBe(404);
    const { ot } = await otNueva();
    const m = await crearMensaje({ ot_id: ot.id }, { autor_id: usuario.id });
    const lectura = await como('lectura');
    expect((await lectura.agente.post(`/api/mensajes/${m.id}/copiar-al-ticket`)).status).toBe(403);
  });

  it('copiar_al_ticket: true en un ticket → 400 y no crea nada', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const r = await agente
      .post(`/api/tickets/${t.id}/mensajes`)
      .send(cuerpo({ copiar_al_ticket: true }));
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('VALIDACION');
    expect(
      await cuenta(`SELECT count(*)::int AS n FROM mensaje WHERE ticket_id = $1`, [t.id]),
    ).toBe(0);
  });

  it('una copia con la OT creada en la misma transacción se revierte si el mensaje falla (archivo ajeno)', async () => {
    const { agente } = await como('tecnico');
    const { t, ot } = await otNueva();
    const ajeno = await crearArchivoPendiente((await crearUsuario()).id);
    const r = await agente
      .post(`/api/ots/${ot.id}/mensajes`)
      .send(cuerpo({ copiar_al_ticket: true, archivo_ids: [ajeno.id] }));
    expect(r.status).toBe(400);
    expect(
      await cuenta(`SELECT count(*)::int AS n FROM mensaje WHERE ot_id = $1 OR ticket_id = $2`, [
        ot.id,
        t.id,
      ]),
    ).toBe(0);
  });
});

describe('GET /api/ots/:id/actividad', () => {
  it('mensajes con ot_id ∪ eventos de la OT, con conteos por pestaña y filtro por tipo', async () => {
    const { agente, usuario } = await como('lectura');
    const { t, ot } = await otNueva();
    await crearMensaje({ ot_id: ot.id }, { tipo: 'seguimiento', autor_id: usuario.id });
    await crearMensaje({ ot_id: ot.id }, { tipo: 'nota_interna', autor_id: usuario.id });
    await crearMensaje(t.id, { tipo: 'seguimiento', autor_id: usuario.id }); // del ticket: no aparece
    await dataSource.query(
      `INSERT INTO evento (entidad, entidad_id, accion) VALUES ('ot', $1, 'tarea_creada'), ('ticket', $2, 'creado')`,
      [String(ot.id), String(t.id)],
    );
    const todo = await agente.get(`/api/ots/${ot.id}/actividad`);
    expect(todo.status).toBe(200);
    expect(todo.body.conteos).toEqual({ todo: 3, seguimiento: 1, nota_interna: 1, historial: 1 });
    expect(todo.body.items).toHaveLength(3);
    const notas = await agente.get(`/api/ots/${ot.id}/actividad?tipo=nota_interna`);
    expect(notas.body.items).toHaveLength(1);
    expect(notas.body.items[0].mensaje).toMatchObject({ tipo: 'nota_interna', ot_id: ot.id });
    const hist = await agente.get(`/api/ots/${ot.id}/actividad?tipo=historial`);
    expect(hist.body.items).toHaveLength(1);
    expect(hist.body.items[0].evento.accion).toBe('tarea_creada');
    expect((await agente.get('/api/ots/999999/actividad')).status).toBe(404);
    expect((await agente.get('/api/ots/999999/mensajes')).status).toBe(404);
  });
});

async function ticketFila(id: number) {
  return (await dataSource.query(`SELECT * FROM ticket WHERE id = $1`, [id]))[0];
}
