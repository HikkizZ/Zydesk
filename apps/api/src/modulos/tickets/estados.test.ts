import { CODIGOS_ERROR } from '@zydesk/shared';
import { describe, expect, it } from 'vitest';
import {
  crearCategoria,
  crearDepartamento,
  crearMensaje,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { otsAbiertas } from './tickets.service.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const eventos = (id: number) =>
  dataSource.query(
    `SELECT accion, campo, valor_anterior, valor_nuevo, datos, req_id FROM evento
      WHERE entidad = 'ticket' AND entidad_id = $1 ORDER BY id`,
    [String(id)],
  );

const fila = async (id: number) =>
  (await dataSource.query(`SELECT * FROM ticket WHERE id = $1`, [id]))[0];

describe('cambiar estado: los 6 payloads', () => {
  it('nuevo → en_curso fija primera_respuesta_en y deja un solo evento con etiquetas', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const r = await agente.post(`/api/tickets/${t.id}/cambiar-estado`).send({ estado: 'en_curso' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'en_curso', cerrado_en: null });
    expect(r.body.primera_respuesta_en).not.toBeNull();
    const evs = await eventos(t.id);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      accion: 'cambio',
      campo: 'estado',
      valor_anterior: 'Nuevo',
      valor_nuevo: 'En curso',
      datos: null,
    });
    expect(evs[0].req_id).toBe(r.headers['x-request-id']);
  });

  it('en_espera guarda espera_de/detalle y los limpia al salir', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket({ estado: 'en_curso' });
    const r = await agente
      .post(`/api/tickets/${t.id}/cambiar-estado`)
      .send({ estado: 'en_espera', espera_de: 'repuesto', espera_detalle: 'Llega el viernes' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      estado: 'en_espera',
      espera_de: 'repuesto',
      espera_detalle: 'Llega el viernes',
    });
    const [ev] = await eventos(t.id);
    expect(ev).toMatchObject({
      valor_anterior: 'En curso',
      valor_nuevo: 'En espera',
      datos: { espera_de: 'repuesto', espera_detalle: 'Llega el viernes' },
    });
    const vuelve = await agente
      .post(`/api/tickets/${t.id}/cambiar-estado`)
      .send({ estado: 'en_curso' });
    expect(vuelve.body).toMatchObject({
      estado: 'en_curso',
      espera_de: null,
      espera_detalle: null,
    });
  });

  it('resuelto cierra (cerrado_en) sin tocar primera_respuesta_en', async () => {
    const { agente } = await como('coordinacion');
    const t = await crearTicket({ estado: 'en_curso' });
    const r = await agente.post(`/api/tickets/${t.id}/cambiar-estado`).send({ estado: 'resuelto' });
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('resuelto');
    expect(r.body.cerrado_en).not.toBeNull();
    expect(r.body.primera_respuesta_en).toBeNull();
  });

  it('descartado guarda el motivo', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const r = await agente
      .post(`/api/tickets/${t.id}/cambiar-estado`)
      .send({ estado: 'descartado', motivo: 'Consulta repetida' });
    expect(r.body).toMatchObject({ estado: 'descartado', motivo_cierre: 'Consulta repetida' });
    expect(r.body.cerrado_en).not.toBeNull();
    const [ev] = await eventos(t.id);
    expect(ev.datos).toEqual({ motivo: 'Consulta repetida' });
  });

  it('duplicado apunta al original y deja "Duplicado de TK-xxxx"', async () => {
    const { agente } = await como('tecnico');
    const original = await crearTicket();
    const t = await crearTicket();
    const r = await agente
      .post(`/api/tickets/${t.id}/cambiar-estado`)
      .send({ estado: 'duplicado', duplicado_de_id: original.id });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      estado: 'duplicado',
      motivo_cierre: `Duplicado de ${original.codigo}`,
      duplicado_de: { id: original.id, codigo: original.codigo },
    });
    const [ev] = await eventos(t.id);
    expect(ev.datos).toEqual({
      duplicado_de_id: original.id,
      duplicado_de_codigo: original.codigo,
    });
  });

  it('reabrir (→ en_curso) limpia cerrado_en, archivado_en, motivo y duplicado', async () => {
    const { agente } = await como('tecnico');
    const descartado = await crearTicket({
      estado: 'descartado',
      cerrado_en: new Date(Date.now() - 20 * 86_400_000),
      archivado_en: new Date(),
    });
    const r = await agente
      .post(`/api/tickets/${descartado.id}/cambiar-estado`)
      .send({ estado: 'en_curso' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      estado: 'en_curso',
      cerrado_en: null,
      archivado_en: null,
      motivo_cierre: null,
    });
    const [ev] = await eventos(descartado.id);
    expect(ev).toMatchObject({ valor_anterior: 'Descartado', valor_nuevo: 'En curso' });

    const dup = await crearTicket({ estado: 'duplicado' });
    const r2 = await agente
      .post(`/api/tickets/${dup.id}/cambiar-estado`)
      .send({ estado: 'en_curso' });
    expect(r2.body).toMatchObject({ estado: 'en_curso', duplicado_de: null, motivo_cierre: null });
    expect((await fila(dup.id)).duplicado_de_id).toBeNull();
  });
});

describe('cambiar estado: reglas (prueba 8)', () => {
  it('resuelto → descartado y estado igual → 409 TRANSICION_INVALIDA con permitidas', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket({ estado: 'resuelto' });
    const r = await agente
      .post(`/api/tickets/${t.id}/cambiar-estado`)
      .send({ estado: 'descartado', motivo: 'x' });
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TRANSICION_INVALIDA');
    expect(r.body.error.detalles).toEqual({
      desde: 'resuelto',
      hasta: 'descartado',
      permitidas: ['en_curso'],
    });
    expect(r.headers['x-request-id']).toBeTruthy();
    const abierto = await crearTicket({ estado: 'en_curso' });
    const igual = await agente
      .post(`/api/tickets/${abierto.id}/cambiar-estado`)
      .send({ estado: 'en_curso' });
    expect(igual.status).toBe(409);
    expect(await eventos(t.id)).toHaveLength(0);
  });

  it('payload incompleto → 400 (en_espera sin espera_de, descartado sin motivo, duplicado sin id)', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    for (const cuerpo of [
      { estado: 'en_espera' },
      { estado: 'descartado' },
      { estado: 'descartado', motivo: '  ' },
      { estado: 'duplicado' },
      { estado: 'inexistente' },
    ]) {
      const r = await agente.post(`/api/tickets/${t.id}/cambiar-estado`).send(cuerpo);
      expect(r.status, JSON.stringify(cuerpo)).toBe(400);
      expect(r.body.error.codigo).toBe('VALIDACION');
    }
    expect((await fila(t.id)).estado).toBe('nuevo');
  });

  it('duplicado de sí mismo, de un duplicado (B14) o de un ticket inexistente → 400 sin cambios', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const dup = await crearTicket({ estado: 'duplicado' });
    for (const duplicado_de_id of [t.id, dup.id, 999999]) {
      const r = await agente
        .post(`/api/tickets/${t.id}/cambiar-estado`)
        .send({ estado: 'duplicado', duplicado_de_id });
      expect(r.status, String(duplicado_de_id)).toBe(400);
      expect(r.body.error.detalles).toHaveProperty('duplicado_de_id');
    }
    expect((await fila(t.id)).estado).toBe('nuevo');
    expect(await eventos(t.id)).toHaveLength(0);
  });

  it('404 si el ticket no existe', async () => {
    const { agente } = await como('tecnico');
    const r = await agente.post('/api/tickets/999999/cambiar-estado').send({ estado: 'en_curso' });
    expect(r.status).toBe(404);
  });

  it('B1 preparado: OT_ABIERTA existe (409) y en Fase 2 no hay OT abiertas', async () => {
    expect(CODIGOS_ERROR.OT_ABIERTA).toBe(409);
    const t = await crearTicket({ estado: 'en_curso' });
    expect(await enTransaccion((tx) => otsAbiertas(tx, t.id))).toEqual([]);
    const { agente } = await como('tecnico');
    const r = await agente.post(`/api/tickets/${t.id}/cambiar-estado`).send({ estado: 'resuelto' });
    expect(r.status).toBe(200);
  });
});

describe('ticket cerrado (prueba 9)', () => {
  it('PATCH, responsables → 409 TICKET_CERRADO; seguidores sí; reabrir → 200', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket({ estado: 'resuelto', archivado_en: new Date() });
    const patch = await agente.patch(`/api/tickets/${t.id}`).send({ asunto: 'x' });
    expect(patch.status).toBe(409);
    expect(patch.body.error.codigo).toBe('TICKET_CERRADO');
    const resp = await agente
      .put(`/api/tickets/${t.id}/responsables`)
      .send({ principal_id: usuario.id, otros_ids: [] });
    expect(resp.status).toBe(409);
    expect(resp.body.error.codigo).toBe('TICKET_CERRADO');
    const seg = await agente
      .put(`/api/tickets/${t.id}/seguidores`)
      .send({ usuario_ids: [usuario.id] });
    expect(seg.status).toBe(200);
    const reabre = await agente
      .post(`/api/tickets/${t.id}/cambiar-estado`)
      .send({ estado: 'en_curso' });
    expect(reabre.status).toBe(200);
    expect(reabre.body.archivado_en).toBeNull();
    expect(
      (await agente.patch(`/api/tickets/${t.id}`).send({ asunto: 'ya se puede' })).status,
    ).toBe(200);
  });
});

describe('responsables y seguidores', () => {
  it('PUT responsables reemplaza el conjunto con principal primero y eventos por campo', async () => {
    const { agente } = await como('coordinacion');
    const ana = await crearUsuario({ nombre: 'Ana Pérez' });
    const beto = await crearUsuario({ nombre: 'Beto Soto' });
    const cata = await crearUsuario({ nombre: 'Cata Díaz' });
    const t = await crearTicket({ principal_id: ana.id });
    const r = await agente
      .put(`/api/tickets/${t.id}/responsables`)
      .send({ principal_id: beto.id, otros_ids: [cata.id, ana.id, cata.id, beto.id] });
    expect(r.status).toBe(200);
    expect(
      r.body.responsables.map((x: { nombre: string; principal: boolean }) => [
        x.nombre,
        x.principal,
      ]),
    ).toEqual([
      ['Beto Soto', true],
      ['Ana Pérez', false],
      ['Cata Díaz', false],
    ]);
    const evs = await eventos(t.id);
    const por = Object.fromEntries(
      evs.map((e: { campo: string; valor_anterior: string | null; valor_nuevo: string | null }) => [
        e.campo,
        [e.valor_anterior, e.valor_nuevo],
      ]),
    );
    expect(por).toEqual({
      responsable_principal: ['Ana Pérez', 'Beto Soto'],
      responsables: [null, 'Ana Pérez, Cata Díaz'],
    });
    // quitar a todos
    const vacio = await agente
      .put(`/api/tickets/${t.id}/responsables`)
      .send({ principal_id: null, otros_ids: [] });
    expect(vacio.body.responsables).toEqual([]);
  });

  it('principal o alguno de los otros inactivo/inexistente → 400 y nada cambia', async () => {
    const { agente } = await como('coordinacion');
    const ana = await crearUsuario();
    const inactivo = await crearUsuario({ activo: false });
    const t = await crearTicket({ principal_id: ana.id });
    const a = await agente
      .put(`/api/tickets/${t.id}/responsables`)
      .send({ principal_id: inactivo.id, otros_ids: [] });
    expect(a.status).toBe(400);
    expect(a.body.error.detalles).toHaveProperty('principal_id');
    const b = await agente
      .put(`/api/tickets/${t.id}/responsables`)
      .send({ principal_id: ana.id, otros_ids: [999999] });
    expect(b.status).toBe(400);
    expect(b.body.error.detalles).toHaveProperty('otros_ids');
    const c = await agente
      .put(`/api/tickets/${t.id}/responsables`)
      .send({ principal_id: null, otros_ids: [ana.id] });
    expect(c.status).toBe(400);
    const [p] = await dataSource.query(
      `SELECT usuario_id FROM ticket_responsable WHERE ticket_id = $1`,
      [t.id],
    );
    expect(p.usuario_id).toBe(ana.id);
    expect(await eventos(t.id)).toHaveLength(0);
  });

  it('B7: cambiar el principal no recalcula fecha_limite ni respuesta_limite', async () => {
    const depto = await crearDepartamento();
    const ana = await crearUsuario({ departamento_id: depto.id });
    const beto = await crearUsuario({ departamento_id: (await crearDepartamento()).id });
    const cat = await crearCategoria();
    const { agente } = await como('coordinacion');
    const creado = await agente.post('/api/tickets').send({
      asunto: 'Plazo',
      descripcion: null,
      cliente_id: null,
      solicitante_nombre: null,
      solicitante_correo: null,
      origen: 'externo',
      prioridad: 'alta',
      categoria_id: cat.id,
      inicio_planificado: null,
      fecha_limite: null,
      horas_estimadas: null,
      responsable_principal_id: ana.id,
    });
    expect(creado.body.fecha_limite).not.toBeNull();
    const r = await agente
      .put(`/api/tickets/${creado.body.id}/responsables`)
      .send({ principal_id: beto.id, otros_ids: [] });
    expect(r.body.fecha_limite).toBe(creado.body.fecha_limite);
    expect(r.body.respuesta_limite).toBe(creado.body.respuesta_limite);
  });

  it('PUT seguidores reemplaza el conjunto, deja evento y valida usuarios', async () => {
    const { agente } = await como('tecnico');
    const ana = await crearUsuario({ nombre: 'Ana Pérez' });
    const beto = await crearUsuario({ nombre: 'Beto Soto' });
    const t = await crearTicket();
    const r = await agente
      .put(`/api/tickets/${t.id}/seguidores`)
      .send({ usuario_ids: [beto.id, ana.id, ana.id] });
    expect(r.status).toBe(200);
    expect(r.body.seguidores.map((s: { nombre: string }) => s.nombre)).toEqual([
      'Ana Pérez',
      'Beto Soto',
    ]);
    const [ev] = await eventos(t.id);
    expect(ev).toMatchObject({
      accion: 'cambio',
      campo: 'seguidores',
      valor_anterior: null,
      valor_nuevo: 'Ana Pérez, Beto Soto',
    });
    const quita = await agente.put(`/api/tickets/${t.id}/seguidores`).send({ usuario_ids: [] });
    expect(quita.body.seguidores).toEqual([]);
    const inactivo = await crearUsuario({ activo: false });
    const mal = await agente
      .put(`/api/tickets/${t.id}/seguidores`)
      .send({ usuario_ids: [inactivo.id] });
    expect(mal.status).toBe(400);
  });
});

describe('cobertura de eventos (ADR 0003)', () => {
  it('cada endpoint mutante de tickets aumenta los eventos del ticket', async () => {
    const { agente, usuario } = await como('coordinacion');
    const cuenta = async (id: number): Promise<number> =>
      Number(
        (
          await dataSource.query(
            `SELECT count(*)::int AS n FROM evento WHERE entidad = 'ticket' AND entidad_id = $1`,
            [String(id)],
          )
        )[0].n,
      );
    const creado = await agente.post('/api/tickets').send({
      asunto: 'Cobertura',
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
    });
    expect(creado.status).toBe(201);
    const id = creado.body.id as number;
    let antes = await cuenta(id);
    expect(antes).toBeGreaterThan(0);
    const pasos: [string, () => Promise<{ status: number }>][] = [
      ['PATCH', () => agente.patch(`/api/tickets/${id}`).send({ asunto: 'Cobertura 2' })],
      [
        'cambiar-estado',
        () => agente.post(`/api/tickets/${id}/cambiar-estado`).send({ estado: 'en_curso' }),
      ],
      [
        'responsables',
        () =>
          agente
            .put(`/api/tickets/${id}/responsables`)
            .send({ principal_id: usuario.id, otros_ids: [] }),
      ],
      [
        'seguidores',
        () => agente.put(`/api/tickets/${id}/seguidores`).send({ usuario_ids: [usuario.id] }),
      ],
    ];
    for (const [nombre, ejecutar] of pasos) {
      expect((await ejecutar()).status, nombre).toBe(200);
      const despues = await cuenta(id);
      expect(despues, nombre).toBeGreaterThan(antes);
      antes = despues;
    }

    // Tareas (F2-T12): cada endpoint mutante deja evento en el ticket
    const tarea = await agente.post(`/api/tickets/${id}/tareas`).send({ titulo: 'Tarea' });
    expect(tarea.status).toBe(201);
    expect(await cuenta(id), 'POST tareas').toBeGreaterThan(antes);
    antes = await cuenta(id);
    const pasosTarea: [string, () => Promise<{ status: number }>, number][] = [
      [
        'PATCH tarea (editar)',
        () => agente.patch(`/api/tareas/${tarea.body.id}`).send({ titulo: 'Otra' }),
        200,
      ],
      [
        'PATCH tarea (hecha)',
        () => agente.patch(`/api/tareas/${tarea.body.id}`).send({ hecha: true }),
        200,
      ],
      [
        'PATCH tarea (reabrir)',
        () => agente.patch(`/api/tareas/${tarea.body.id}`).send({ hecha: false }),
        200,
      ],
      ['DELETE tarea', () => agente.delete(`/api/tareas/${tarea.body.id}`), 204],
    ];
    for (const [nombre, ejecutar, status] of pasosTarea) {
      expect((await ejecutar()).status, nombre).toBe(status);
      const despues = await cuenta(id);
      expect(despues, nombre).toBeGreaterThan(antes);
      antes = despues;
    }

    // Los mensajes no generan evento (el mensaje es el registro)
    const mensaje = await agente
      .post(`/api/tickets/${id}/mensajes`)
      .send({ tipo: 'seguimiento', texto: 'Avance', horas: 1 });
    expect(mensaje.status).toBe(201);
    expect(await cuenta(id), 'POST mensajes').toBe(antes);
  });

  it('las lecturas no escriben: GET de ticket, listado y tablero no crean eventos ni cambian filas', async () => {
    const { agente } = await como('lectura');
    const t = await crearTicket();
    await crearMensaje(t.id, { autor_id: null });
    await crearTarea(t.id);
    const antes = await dataSource.query(`SELECT actualizado_en FROM ticket WHERE id = $1`, [t.id]);
    await agente.get(`/api/tickets/${t.id}`);
    await agente.get('/api/tickets');
    await agente.get('/api/tickets/tablero');
    expect(await eventos(t.id)).toHaveLength(0);
    expect(await dataSource.query(`SELECT count(*)::int AS n FROM evento`)).toEqual([{ n: 0 }]);
    expect(
      await dataSource.query(`SELECT actualizado_en FROM ticket WHERE id = $1`, [t.id]),
    ).toEqual(antes);
  });
});
