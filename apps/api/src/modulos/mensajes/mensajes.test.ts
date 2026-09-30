import { describe, expect, it } from 'vitest';
import {
  crearArchivoPendiente,
  crearMensaje,
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

const nEventos = async (id: number): Promise<number> =>
  Number(
    (
      await dataSource.query(
        `SELECT count(*)::int AS n FROM evento WHERE entidad = 'ticket' AND entidad_id = $1`,
        [String(id)],
      )
    )[0].n,
  );

const ticketFila = async (id: number) =>
  (await dataSource.query(`SELECT * FROM ticket WHERE id = $1`, [id]))[0];

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  tipo: 'seguimiento',
  texto: 'Se revisó el ERP con el cliente',
  ...extra,
});

describe('POST /api/tickets/:id/mensajes', () => {
  it('crea un seguimiento: 201, autor, sin evento, actualiza el ticket y fija primera_respuesta_en', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket({ actualizado_en: new Date('2020-01-01T00:00:00Z') });
    const r = await agente.post(`/api/tickets/${t.id}/mensajes`).send(cuerpo());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      ticket_id: t.id,
      tipo: 'seguimiento',
      texto: 'Se revisó el ERP con el cliente',
      horas: null,
      archivos: [],
      mencionados: [],
      autor: { id: usuario.id, nombre: usuario.nombre },
    });
    expect(await nEventos(t.id)).toBe(0);
    const f = await ticketFila(t.id);
    expect(f.primera_respuesta_en).not.toBeNull();
    expect(new Date(f.actualizado_en).getFullYear()).toBeGreaterThan(2020);
  });

  it('la primera respuesta no se mueve con un segundo seguimiento ni la fija una nota interna', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    await agente.post(`/api/tickets/${t.id}/mensajes`).send(cuerpo({ tipo: 'nota_interna' }));
    expect((await ticketFila(t.id)).primera_respuesta_en).toBeNull();
    await agente.post(`/api/tickets/${t.id}/mensajes`).send(cuerpo());
    const primera = (await ticketFila(t.id)).primera_respuesta_en;
    expect(primera).not.toBeNull();
    await agente.post(`/api/tickets/${t.id}/mensajes`).send(cuerpo({ texto: 'otro' }));
    expect((await ticketFila(t.id)).primera_respuesta_en).toEqual(primera);
  });

  it('guarda menciones (solo ids, sin duplicar) y las devuelve', async () => {
    const { agente } = await como('tecnico');
    const ana = await crearUsuario({ nombre: 'Ana Mena' });
    const t = await crearTicket();
    const r = await agente
      .post(`/api/tickets/${t.id}/mensajes`)
      .send(cuerpo({ texto: 'Hola @Ana Mena', mencionados_ids: [ana.id, ana.id] }));
    expect(r.status).toBe(201);
    expect(r.body.mencionados).toHaveLength(1);
    expect(r.body.mencionados[0]).toMatchObject({ id: ana.id, nombre: 'Ana Mena' });
    expect(await dataSource.query(`SELECT usuario_id FROM mencion`)).toEqual([
      { usuario_id: ana.id },
    ]);
  });

  it('mención a usuario inactivo o inexistente → 400 VALIDACION y no deja nada', async () => {
    const { agente } = await como('tecnico');
    const inactivo = await crearUsuario({ activo: false });
    const t = await crearTicket();
    for (const ids of [[inactivo.id], [999999]]) {
      const r = await agente
        .post(`/api/tickets/${t.id}/mensajes`)
        .send(cuerpo({ mencionados_ids: ids }));
      expect(r.status).toBe(400);
      expect(r.body.error.codigo).toBe('VALIDACION');
      expect(r.body.error.detalles.mencionados_ids).toBeDefined();
    }
    expect(await dataSource.query(`SELECT 1 FROM mensaje`)).toEqual([]);
  });

  it('asocia archivos pendientes propios al mensaje; ajenos → 400 y revierte', async () => {
    const { agente, usuario } = await como('tecnico');
    const otro = await crearUsuario();
    const t = await crearTicket();
    const propio = await crearArchivoPendiente(usuario.id, {
      nombre: 'foto.png',
      tipo_mime: 'image/png',
    });
    const ajeno = await crearArchivoPendiente(otro.id);

    const mal = await agente
      .post(`/api/tickets/${t.id}/mensajes`)
      .send(cuerpo({ archivo_ids: [propio.id, ajeno.id] }));
    expect(mal.status).toBe(400);
    expect(mal.body.error.codigo).toBe('VALIDACION');
    expect(await dataSource.query(`SELECT 1 FROM mensaje`)).toEqual([]);

    const r = await agente
      .post(`/api/tickets/${t.id}/mensajes`)
      .send(cuerpo({ archivo_ids: [propio.id] }));
    expect(r.status).toBe(201);
    expect(r.body.archivos).toHaveLength(1);
    expect(r.body.archivos[0]).toMatchObject({ id: propio.id, nombre_original: 'foto.png' });
    const [a] = await dataSource.query(
      `SELECT entidad, entidad_id, mensaje_id FROM archivo WHERE id = $1`,
      [propio.id],
    );
    expect(a).toEqual({ entidad: 'ticket', entidad_id: t.id, mensaje_id: r.body.id });
    // no aparece entre los archivos propios del ticket
    const det = await agente.get(`/api/tickets/${t.id}`);
    expect(det.body.archivos).toEqual([]);
  });

  it('permitido en tickets cerrados y archivados', async () => {
    const { agente } = await como('tecnico');
    const cerrado = await crearTicket({ estado: 'resuelto' });
    const archivado = await crearTicket({ estado: 'descartado', archivado_en: new Date() });
    for (const t of [cerrado, archivado]) {
      const r = await agente
        .post(`/api/tickets/${t.id}/mensajes`)
        .send(cuerpo({ tipo: 'nota_interna' }));
      expect(r.status).toBe(201);
      expect((await ticketFila(t.id)).estado).toBe(t.estado);
    }
  });

  it('prueba 7: el texto con HTML se guarda y se devuelve tal cual', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const texto = '<img src=x onerror=alert(1)>';
    const r = await agente.post(`/api/tickets/${t.id}/mensajes`).send(cuerpo({ texto }));
    expect(r.status).toBe(201);
    expect(r.body.texto).toBe(texto);
    const lista = await agente.get(`/api/tickets/${t.id}/mensajes`);
    expect(lista.body[0].texto).toBe(texto);
  });

  it('validación: texto vacío, tipo inválido, horas fuera de rango o no múltiplo de 0,25 → 400', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    for (const mal of [
      { texto: '   ' },
      { tipo: 'otro' },
      { horas: 0 },
      { horas: 25 },
      { horas: 1.1 },
      { mencionados_ids: Array.from({ length: 21 }, (_, i) => i + 1) },
    ]) {
      const r = await agente.post(`/api/tickets/${t.id}/mensajes`).send(cuerpo(mal));
      expect(r.status, JSON.stringify(mal)).toBe(400);
    }
  });

  it('ticket inexistente → 404', async () => {
    const { agente } = await como('tecnico');
    expect((await agente.post('/api/tickets/999999/mensajes').send(cuerpo())).status).toBe(404);
    expect((await agente.get('/api/tickets/999999/mensajes')).status).toBe(404);
    expect((await agente.get('/api/tickets/999999/actividad')).status).toBe(404);
  });

  it('prueba 1: lectura → 403 y no deja rastro; sin sesión → 401', async () => {
    const { agente } = await como('lectura');
    const t = await crearTicket();
    const r = await agente.post(`/api/tickets/${t.id}/mensajes`).send(cuerpo({ horas: 1 }));
    expect(r.status).toBe(403);
    expect(r.body.error.codigo).toBe('SIN_PERMISO');
    expect(await dataSource.query(`SELECT 1 FROM mensaje`)).toEqual([]);
    expect(await dataSource.query(`SELECT 1 FROM registro_horas`)).toEqual([]);
    const { default: request } = await import('supertest');
    const sin = await request(app())
      .post(`/api/tickets/${t.id}/mensajes`)
      .set('X-Requested-With', 'Zydesk')
      .send(cuerpo());
    expect(sin.status).toBe(401);
  });
});

describe('horas desde el redactor (B5)', () => {
  it('con horas crea una fila con la fecha de hoy en Santiago y mensaje_id; sin horas no crea nada', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket();
    const sin = await agente.post(`/api/tickets/${t.id}/mensajes`).send(cuerpo());
    expect(sin.status).toBe(201);
    expect(await dataSource.query(`SELECT 1 FROM registro_horas`)).toEqual([]);

    const r = await agente.post(`/api/tickets/${t.id}/mensajes`).send(cuerpo({ horas: 1.5 }));
    expect(r.status).toBe(201);
    expect(r.body.horas).toBe(1.5);
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
      new Date(),
    );
    const filas = await dataSource.query(
      `SELECT usuario_id, fecha::text AS fecha, ticket_id, mensaje_id, horas::float8 AS horas,
              fuera_de_horario, descripcion FROM registro_horas`,
    );
    expect(filas).toEqual([
      {
        usuario_id: usuario.id,
        fecha: hoy,
        ticket_id: t.id,
        mensaje_id: r.body.id,
        horas: 1.5,
        fuera_de_horario: false,
        descripcion: null,
      },
    ]);
  });
});

describe('GET /api/tickets/:id/mensajes', () => {
  it('ordena por creado_en asc y filtra por tipo', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket();
    const a = await crearMensaje(t.id, { autor_id: usuario.id, tipo: 'seguimiento', texto: 'uno' });
    const b = await crearMensaje(t.id, {
      autor_id: usuario.id,
      tipo: 'nota_interna',
      texto: 'dos',
    });
    const todos = await agente.get(`/api/tickets/${t.id}/mensajes`);
    expect(todos.body.map((m: { id: number }) => m.id)).toEqual([a.id, b.id]);
    const notas = await agente.get(`/api/tickets/${t.id}/mensajes?tipo=nota_interna`);
    expect(notas.body.map((m: { id: number }) => m.id)).toEqual([b.id]);
    expect((await agente.get(`/api/tickets/${t.id}/mensajes?tipo=x`)).status).toBe(400);
  });

  it('prueba 2 (B10): lectura ve las notas internas', async () => {
    const { agente } = await como('lectura');
    const autor = await crearUsuario();
    const t = await crearTicket();
    await crearMensaje(t.id, { autor_id: autor.id, tipo: 'nota_interna', texto: 'solo equipo' });
    const r = await agente.get(`/api/tickets/${t.id}/mensajes`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].texto).toBe('solo equipo');
  });

  it('las lecturas no escriben', async () => {
    const { agente, usuario } = await como('lectura');
    const t = await crearTicket();
    await crearMensaje(t.id, { autor_id: usuario.id });
    const antes = await ticketFila(t.id);
    await agente.get(`/api/tickets/${t.id}/mensajes`);
    await agente.get(`/api/tickets/${t.id}/actividad`);
    expect(await ticketFila(t.id)).toEqual(antes);
    expect(await dataSource.query(`SELECT 1 FROM evento`)).toEqual([]);
  });
});

describe('GET /api/tickets/:id/actividad', () => {
  it('mezcla mensajes y eventos por instante con conteos; eventos antes que mensajes a igual instante', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket();
    await agente.post(`/api/tickets/${t.id}/tareas`).send({ titulo: 'Revisar' }); // evento
    await agente.post(`/api/tickets/${t.id}/mensajes`).send(cuerpo({ texto: 'seg' }));
    await agente
      .post(`/api/tickets/${t.id}/mensajes`)
      .send(cuerpo({ tipo: 'nota_interna', texto: 'nota' }));
    await agente.post(`/api/tickets/${t.id}/cambiar-estado`).send({ estado: 'en_curso' }); // evento

    const r = await agente.get(`/api/tickets/${t.id}/actividad`);
    expect(r.status).toBe(200);
    expect(r.body.conteos).toEqual({ todo: 4, seguimiento: 1, nota_interna: 1, historial: 2 });
    type Item = {
      tipo: string;
      creado_en: string;
      mensaje?: { texto: string };
      evento?: { accion: string };
    };
    const items: Item[] = r.body.items;
    expect(items.map((i) => (i.tipo === 'mensaje' ? i.mensaje!.texto : i.evento!.accion))).toEqual([
      'tarea_creada',
      'seg',
      'nota',
      'cambio',
    ]);
    expect(items.map((i) => i.creado_en)).toEqual([...items.map((i) => i.creado_en)].sort());
    expect(items[0]!.evento).toMatchObject({
      autor: { id: usuario.id },
      datos: { titulo: 'Revisar' },
    });
    expect(items[3]!.evento).toMatchObject({
      campo: 'estado',
      valor_anterior: 'Nuevo',
      valor_nuevo: 'En curso',
    });
  });

  it('a igual instante el evento va antes que el mensaje', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket();
    const instante = '2026-01-01T10:00:00Z';
    await crearMensaje(t.id, { autor_id: usuario.id, texto: 'msg' });
    await dataSource.query(`UPDATE mensaje SET creado_en = $1`, [instante]);
    await dataSource.query(
      `INSERT INTO evento (entidad, entidad_id, autor_id, accion, creado_en) VALUES ('ticket', $1, NULL, 'archivado', $2)`,
      [String(t.id), instante],
    );
    const r = await agente.get(`/api/tickets/${t.id}/actividad`);
    expect(r.body.items.map((i: { tipo: string }) => i.tipo)).toEqual(['evento', 'mensaje']);
    expect(r.body.items[0].evento.autor).toBeNull();
  });

  it('el filtro por tipo recorta items pero no los conteos', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket();
    await crearMensaje(t.id, { autor_id: usuario.id, tipo: 'seguimiento' });
    await crearMensaje(t.id, { autor_id: usuario.id, tipo: 'nota_interna' });
    await dataSource.query(
      `INSERT INTO evento (entidad, entidad_id, accion) VALUES ('ticket', $1, 'archivado')`,
      [String(t.id)],
    );
    const esperado = { todo: 3, seguimiento: 1, nota_interna: 1, historial: 1 };
    for (const [tipo, tipos] of [
      ['seguimiento', ['mensaje']],
      ['nota_interna', ['mensaje']],
      ['historial', ['evento']],
      ['todo', ['mensaje', 'mensaje', 'evento']],
    ] as const) {
      const r = await agente.get(`/api/tickets/${t.id}/actividad?tipo=${tipo}`);
      expect(r.status).toBe(200);
      expect(r.body.conteos).toEqual(esperado);
      expect(r.body.items.map((i: { tipo: string }) => i.tipo)).toEqual(tipos);
    }
    const seg = await agente.get(`/api/tickets/${t.id}/actividad?tipo=seguimiento`);
    expect(seg.body.items[0].mensaje.tipo).toBe('seguimiento');
    expect((await agente.get(`/api/tickets/${t.id}/actividad?tipo=otro`)).status).toBe(400);
  });

  it('prueba 2 (B10): lectura ve notas internas en la actividad', async () => {
    const { agente } = await como('lectura');
    const autor = await crearUsuario();
    const t = await crearTicket();
    await crearMensaje(t.id, { autor_id: autor.id, tipo: 'nota_interna', texto: 'reservada' });
    const r = await agente.get(`/api/tickets/${t.id}/actividad`);
    expect(r.status).toBe(200);
    expect(r.body.items[0].mensaje.texto).toBe('reservada');
    expect(r.body.conteos.nota_interna).toBe(1);
  });

  it('incluye archivos y mencionados del mensaje', async () => {
    const { agente, usuario } = await como('tecnico');
    const ana = await crearUsuario({ nombre: 'Ana Mena' });
    const t = await crearTicket();
    const archivo = await crearArchivoPendiente(usuario.id, {
      nombre: 'acta.pdf',
      tipo_mime: 'application/pdf',
    });
    await agente
      .post(`/api/tickets/${t.id}/mensajes`)
      .send(cuerpo({ archivo_ids: [archivo.id], mencionados_ids: [ana.id] }));
    const r = await agente.get(`/api/tickets/${t.id}/actividad`);
    const m = r.body.items[0].mensaje;
    expect(m.archivos[0]).toMatchObject({ id: archivo.id, nombre_original: 'acta.pdf' });
    expect(m.mencionados[0]).toMatchObject({ id: ana.id });
  });
});
