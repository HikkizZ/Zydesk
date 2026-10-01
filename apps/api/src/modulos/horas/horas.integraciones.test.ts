import type { Rol } from '@zydesk/shared';
import { describe, expect, it } from 'vitest';
import {
  crearBolsa,
  crearCliente,
  crearOt,
  crearRegistroHoras,
  crearTarea,
  crearTicket,
  crearUsuario,
  fijarTarifas,
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

describe('integración: tareas (prueba 13)', () => {
  it('horas_registradas por tarea en la OT, en sus listados y en el PATCH; 0 en tareas de ticket', async () => {
    const { agente } = await como('tecnico');
    const ticket = await crearTicket();
    const ot = await crearOt(ticket.id, { etapa: 'en_ejecucion' });
    const conHoras = await crearTarea({ ot_id: ot.id }, { titulo: 'Diagnóstico' });
    const sinHoras = await crearTarea({ ot_id: ot.id }, { titulo: 'Informe' });
    const deTicket = await crearTarea(ticket.id);

    const r = await agente
      .post('/api/horas')
      .send({ fecha: hoy(), ot_id: ot.id, tarea_id: conHoras.id, horas: 3 });
    expect(r.status).toBe(201);

    const detalle = await agente.get(`/api/ots/${ot.id}`);
    const porId = (id: number) =>
      detalle.body.tareas.find((t: { id: number }) => t.id === id) as {
        horas_registradas: number;
        horas_reales: number | null;
      };
    expect(porId(conHoras.id).horas_registradas).toBe(3);
    expect(porId(conHoras.id).horas_reales).toBeNull(); // no se toca horas_reales
    expect(porId(sinHoras.id).horas_registradas).toBe(0);
    expect(detalle.body.horas.registradas).toBe(3);

    const lista = await agente.get(`/api/ots/${ot.id}/tareas`);
    expect(lista.body.find((t: { id: number }) => t.id === conHoras.id).horas_registradas).toBe(3);
    const patch = await agente.patch(`/api/tareas/${conHoras.id}`).send({ hecha: true });
    expect(patch.body.horas_registradas).toBe(3);

    const deTk = await agente.get(`/api/tickets/${ticket.id}/tareas`);
    expect(deTk.body.find((t: { id: number }) => t.id === deTicket.id).horas_registradas).toBe(0);
  });

  it('suma varias filas de la tarea (manual y de seguimiento, de dos personas)', async () => {
    const { agente, usuario } = await como('tecnico');
    const otra = await crearUsuario();
    const ot = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const tarea = await crearTarea({ ot_id: ot.id });
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, tarea_id: tarea.id, horas: 1.5 });
    await crearRegistroHoras(otra.id, { ot_id: ot.id, tarea_id: tarea.id, horas: 2 });
    const r = await agente.get(`/api/ots/${ot.id}/tareas`);
    expect(r.body[0].horas_registradas).toBe(3.5);
  });
});

describe('integración: cierre con nueva_ot (prueba 13)', () => {
  it('mueve la tarea abierta y deja la fila con tarea_id NULL y el mismo ot_id', async () => {
    const coord = await como('coordinacion');
    const principal = await crearUsuario();
    const ticket = await crearTicket({ estado: 'en_curso', principal_id: principal.id });
    const ot = await crearOt(ticket.id, { etapa: 'en_ejecucion' });
    const abierta = await crearTarea({ ot_id: ot.id }, { titulo: 'Pendiente' });
    const hecha = await crearTarea({ ot_id: ot.id }, { titulo: 'Hecha', hecha: true });
    const filaAbierta = await crearRegistroHoras(coord.usuario.id, {
      ot_id: ot.id,
      tarea_id: abierta.id,
      horas: 2,
    });
    const filaHecha = await crearRegistroHoras(coord.usuario.id, {
      ot_id: ot.id,
      tarea_id: hecha.id,
      horas: 1,
    });

    const r = await coord.agente.post(`/api/ots/${ot.id}/cerrar`).send({
      resolvio_ticket: false,
      resumen: 'Sigue',
      siguiente: { accion: 'nueva_ot', responsable_id: (await crearUsuario()).id },
    });
    expect(r.status).toBe(200);

    const [a] = await dataSource.query(`SELECT ot_id, tarea_id FROM registro_horas WHERE id = $1`, [
      filaAbierta.id,
    ]);
    expect(a).toEqual({ ot_id: ot.id, tarea_id: null });
    // la tarea hecha se queda en la OT original con sus horas
    const [h] = await dataSource.query(`SELECT ot_id, tarea_id FROM registro_horas WHERE id = $1`, [
      filaHecha.id,
    ]);
    expect(h).toEqual({ ot_id: ot.id, tarea_id: hecha.id });
  });
});

describe('integración: bolsa del cliente (prueba 13)', () => {
  it('horas_usadas_mes del contrato vigente = bolsa.usadas_mes de la OT; historial null', async () => {
    const { agente, usuario } = await como('coordinacion');
    const cliente = await crearCliente();
    const vigente = await crearBolsa(cliente.id, { vigente_desde: '2020-01-01' });
    const ot = await crearOt((await crearTicket()).id, {
      tipo: 'facturable',
      etapa: 'en_ejecucion',
      cliente_id: cliente.id,
      contrato_id: vigente.id,
    });
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, horas: 2.5 });
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, horas: 4, fecha: '2020-03-10' }); // otro mes

    const o = await agente.get(`/api/ots/${ot.id}`);
    const c = await agente.get(`/api/clientes/${cliente.id}`);
    expect(o.body.bolsa.usadas_mes).toBe(2.5);
    expect(c.body.bolsa.vigente.horas_usadas_mes).toBe(2.5);
    expect(c.body.bolsa.vigente.horas_usadas_mes).toBe(o.body.bolsa.usadas_mes);
  });

  it('contrato vigente sin horas → 0; contrato del historial → null', async () => {
    const { agente } = await como('coordinacion');
    const cliente = await crearCliente();
    await dataSource.query(
      `INSERT INTO contrato_bolsa (cliente_id, horas_mes, vigente_desde, vigente_hasta) VALUES ($1, 10, '2019-01-01', '2019-12-31')`,
      [cliente.id],
    );
    await crearBolsa(cliente.id, { vigente_desde: '2020-01-01' });
    const c = await agente.get(`/api/clientes/${cliente.id}`);
    expect(c.body.bolsa.vigente.horas_usadas_mes).toBe(0);
    const historial = c.body.bolsa.historial as {
      vigente: boolean;
      horas_usadas_mes: number | null;
    }[];
    expect(historial).toHaveLength(2);
    expect(historial.find((b) => !b.vigente)!.horas_usadas_mes).toBeNull();
    expect(historial.find((b) => b.vigente)!.horas_usadas_mes).toBe(0);
  });
});

describe('integración: costo interno (prueba 13)', () => {
  it('una OT interna con tarifa de costo interno incluye las horas de la planilla', async () => {
    const { agente } = await como('tecnico');
    await fijarTarifas({ costo_interno: 18000 });
    const ot = await crearOt((await crearTicket()).id, { tipo: 'interna', etapa: 'en_ejecucion' });
    const r = await agente.post('/api/horas').send({ fecha: hoy(), ot_id: ot.id, horas: 2 });
    expect(r.status).toBe(201);
    const o = await agente.get(`/api/ots/${ot.id}`);
    expect(o.body.costo_interno).toEqual({ horas: 2, tarifa: 18000, monto: 36000 });
  });
});
