import { describe, expect, it } from 'vitest';
import {
  crearArchivoPendiente,
  crearCliente,
  crearContacto,
  crearCotizacion,
  crearMensaje,
  crearOt,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

type Agente = Awaited<ReturnType<typeof ingresarComo>>['agente'];
interface Datos {
  usuario: { id: number };
  contacto: { id: number };
  borrador: { id: number };
  interna: { id: number };
  cotizada: { id: number };
  cerrada: { id: number };
  tarea: { id: number };
}

const app = () => crearApp({ comprobarBd: async () => true });

async function admin() {
  const usuario = await crearUsuario({ rol: 'admin' });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const n = async (entidad: 'ot' | 'ticket', id: number): Promise<number> =>
  Number(
    (
      await dataSource.query(
        `SELECT count(*)::int AS n FROM evento WHERE entidad = $1 AND entidad_id = $2`,
        [entidad, String(id)],
      )
    )[0].n,
  );
const total = async (): Promise<number> =>
  Number((await dataSource.query(`SELECT count(*)::int AS n FROM evento`))[0].n);

// Cobertura de eventos (ADR 0003, spec fase 3 §8): cada endpoint mutante de OT deja su rastro.
describe('cobertura de eventos de OT', () => {
  it('convertir-en-ot registra en la OT nueva y en el ticket', async () => {
    const { agente } = await admin();
    const t = await crearTicket({ estado: 'en_curso' });
    const antesTicket = await n('ticket', t.id);
    const r = await agente.post(`/api/tickets/${t.id}/convertir-en-ot`).send({ tipo: 'interna' });
    expect(r.status).toBe(201);
    expect(await n('ot', r.body.id)).toBeGreaterThan(0);
    expect(await n('ticket', t.id)).toBeGreaterThan(antesTicket);
  });

  it.each([
    [
      'PATCH',
      (a: Agente, d: Datos) => a.patch(`/api/ots/${d.borrador.id}`).send({ titulo: 'Otro título' }),
      'borrador',
    ],
    [
      'cambiar-etapa',
      (a: Agente, d: Datos) =>
        a.post(`/api/ots/${d.cotizada.id}/cambiar-etapa`).send({ etapa: 'borrador' }),
      'cotizada',
    ],
    [
      'aprobar',
      (a: Agente, d: Datos) => a.post(`/api/ots/${d.interna.id}/aprobar`).send({}),
      'interna',
    ],
    [
      'aprobacion',
      async (a: Agente, d: Datos) =>
        a.put(`/api/ots/${d.cotizada.id}/aprobacion`).send({
          contacto_id: d.contacto.id,
          fecha: '2026-09-28',
          forma: 'correo',
          archivo_id: (await crearArchivoPendiente(d.usuario.id)).id,
        }),
      'cotizada',
    ],
    [
      'facturar',
      (a: Agente, d: Datos) =>
        a.post(`/api/ots/${d.cerrada.id}/facturar`).send({ n_factura: 'F-1' }),
      'cerrada',
    ],
    [
      'archivos',
      async (a: Agente, d: Datos) =>
        a
          .post(`/api/ots/${d.borrador.id}/archivos`)
          .send({ archivo_ids: [(await crearArchivoPendiente(d.usuario.id)).id] }),
      'borrador',
    ],
    [
      'POST tareas',
      (a: Agente, d: Datos) => a.post(`/api/ots/${d.borrador.id}/tareas`).send({ titulo: 'Tarea' }),
      'borrador',
    ],
    [
      'PATCH tarea',
      (a: Agente, d: Datos) => a.patch(`/api/tareas/${d.tarea.id}`).send({ titulo: 'Editada' }),
      'borrador',
    ],
    [
      'marcar tarea',
      (a: Agente, d: Datos) => a.patch(`/api/tareas/${d.tarea.id}`).send({ hecha: true }),
      'borrador',
    ],
    ['DELETE tarea', (a: Agente, d: Datos) => a.delete(`/api/tareas/${d.tarea.id}`), 'borrador'],
  ] as const)('%s aumenta los eventos de la OT', async (_nombre, enviar, cual) => {
    const { agente, usuario } = await admin();
    const cliente = await crearCliente();
    const contacto = await crearContacto(cliente.id);
    const ticket = await crearTicket({ estado: 'en_curso', cliente_id: cliente.id });
    const crear = (etapa: 'borrador' | 'cotizada' | 'cerrada', tipo = 'facturable') =>
      crearOt(ticket.id, { etapa, tipo: tipo as 'facturable' | 'interna', cliente_id: cliente.id });
    const borrador = await crear('borrador');
    const cotizada = await crear('cotizada');
    // la OT cotizada tiene su cotización enviada: la aprobación del cliente la exige (spec fase 4 §6.2)
    await crearCotizacion(cotizada.id, {
      estado: 'enviada',
      contacto_id: contacto.id,
      lineas: [{ cantidad: 1, precio_unitario: 475000 }],
    });
    const datos = {
      usuario,
      contacto,
      borrador,
      interna: await crear('borrador', 'interna'),
      cotizada,
      cerrada: await crear('cerrada'),
      tarea: await crearTarea({ ot_id: borrador.id }),
    };
    const objetivo = {
      borrador: datos.borrador,
      interna: datos.interna,
      cotizada: datos.cotizada,
      cerrada: datos.cerrada,
    }[cual];
    const antes = await n('ot', objetivo.id);
    const r = await enviar(agente, datos);
    expect([200, 201, 204]).toContain(r.status);
    expect(await n('ot', objetivo.id)).toBeGreaterThan(antes);
  });

  it('cancelar registra en la OT y en el ticket', async () => {
    const { agente } = await admin();
    const t = await crearTicket({ estado: 'en_curso' });
    const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
    const [a, b] = [await n('ot', ot.id), await n('ticket', t.id)];
    const r = await agente.post(`/api/ots/${ot.id}/cancelar`).send({ motivo: 'Ya no aplica' });
    expect(r.status).toBe(200);
    expect(await n('ot', ot.id)).toBeGreaterThan(a);
    expect(await n('ticket', t.id)).toBeGreaterThan(b);
  });

  it('cerrar registra en la OT y en el ticket', async () => {
    const { agente } = await admin();
    const t = await crearTicket({ estado: 'en_curso' });
    const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
    const [a, b] = [await n('ot', ot.id), await n('ticket', t.id)];
    const r = await agente
      .post(`/api/ots/${ot.id}/cerrar`)
      .send({ resolvio_ticket: true, resumen: 'Listo' });
    expect(r.status).toBe(200);
    expect(await n('ot', ot.id)).toBeGreaterThan(a);
    expect(await n('ticket', t.id)).toBeGreaterThan(b);
  });

  it('copiar-al-ticket registra en el ticket', async () => {
    const { agente, usuario } = await admin();
    const t = await crearTicket({ estado: 'en_curso' });
    const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
    const m = await crearMensaje({ ot_id: ot.id }, { autor_id: usuario.id });
    const antes = await n('ticket', t.id);
    const r = await agente.post(`/api/mensajes/${m.id}/copiar-al-ticket`).send();
    expect(r.status).toBe(201);
    expect(await n('ticket', t.id)).toBeGreaterThan(antes);
  });

  it('POST mensajes de OT no crea ningún evento (el mensaje es el registro)', async () => {
    const { agente } = await admin();
    const t = await crearTicket({ estado: 'en_curso' });
    const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
    const antes = await total();
    const r = await agente
      .post(`/api/ots/${ot.id}/mensajes`)
      .send({ tipo: 'seguimiento', texto: 'Avance', horas: 1 });
    expect(r.status).toBe(201);
    expect(await total()).toBe(antes);
  });
});
