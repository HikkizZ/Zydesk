import { describe, expect, it } from 'vitest';
import {
  crearCliente,
  crearOt,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { fuenteNumeros } from '../../core/numeracion/fuente.js';
import { otsAbiertas } from './tickets.service.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura' = 'tecnico') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

describe('otsAbiertas y B1 (prueba 6)', () => {
  it('otsAbiertas devuelve solo las OT no cerradas ni canceladas', async () => {
    const t = await crearTicket({ estado: 'en_curso' });
    const abierta = await crearOt(t.id, { etapa: 'en_ejecucion' });
    await crearOt(t.id, { etapa: 'cerrada' });
    await crearOt(t.id, { etapa: 'cancelada' });
    const r = await enTransaccion((tx) => otsAbiertas(tx, t.id));
    expect(r).toEqual([{ id: abierta.id, codigo: abierta.codigo, etapa: 'en_ejecucion' }]);
  });

  it.each([
    ['resuelto', {}],
    ['descartado', { motivo: 'No procede' }],
    ['duplicado', 'duplicado'],
  ] as const)('OT abierta bloquea %s con 409 OT_ABIERTA', async (estado, extra) => {
    const { agente } = await como('tecnico');
    const t = await crearTicket({ estado: 'en_curso' });
    const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
    const cuerpo =
      extra === 'duplicado'
        ? { estado, duplicado_de_id: (await crearTicket()).id }
        : { estado, ...extra };
    const r = await agente.post(`/api/tickets/${t.id}/cambiar-estado`).send(cuerpo);
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('OT_ABIERTA');
    expect(r.body.error.detalles).toEqual({
      ots: [{ id: ot.id, codigo: ot.codigo, etapa: 'en_ejecucion' }],
    });
    const [fila] = await dataSource.query(`SELECT estado FROM ticket WHERE id = $1`, [t.id]);
    expect(fila.estado).toBe('en_curso');

    // al cerrar la OT el cambio se permite
    await dataSource.query(
      `UPDATE ot SET etapa = 'cerrada', resumen_cierre = 'ok', resolvio_ticket = false, cerrada_en = now() WHERE id = $1`,
      [ot.id],
    );
    const ok = await agente.post(`/api/tickets/${t.id}/cambiar-estado`).send(cuerpo);
    expect(ok.status).toBe(200);
  });

  it('una OT cancelada no bloquea', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket({ estado: 'en_curso' });
    await crearOt(t.id, { etapa: 'cancelada' });
    const r = await agente.post(`/api/tickets/${t.id}/cambiar-estado`).send({ estado: 'resuelto' });
    expect(r.status).toBe(200);
  });
});

describe('resumen, vinculada y filtros (prueba 14, parte tickets)', () => {
  it('ot_vinculada prefiere la abierta más reciente y luego la cerrada; la cancelada no vincula', async () => {
    const { agente } = await como('lectura');
    const solo = await crearTicket();
    await crearOt(solo.id, { etapa: 'cancelada' });
    const conAbierta = await crearTicket();
    await crearOt(conAbierta.id, { tipo: 'interna', etapa: 'en_ejecucion' });
    const reciente = await crearOt(conAbierta.id, { tipo: 'facturable', etapa: 'borrador' });
    await crearOt(conAbierta.id, { etapa: 'cerrada' }); // más nueva pero cerrada
    const soloCerrada = await crearTicket();
    await crearOt(soloCerrada.id, { etapa: 'cerrada', tipo: 'interna' });
    const cerrada2 = await crearOt(soloCerrada.id, { etapa: 'cerrada', tipo: 'interna' });
    const sinOt = await crearTicket();

    const r = await agente.get('/api/tickets?por_pagina=50');
    const por = new Map<number, { tipo: string; ot_vinculada: unknown }>(
      r.body.datos.map((t: { id: number; tipo: string; ot_vinculada: unknown }) => [t.id, t]),
    );
    expect(por.get(solo.id)).toMatchObject({ tipo: 'ticket', ot_vinculada: null });
    expect(por.get(sinOt.id)).toMatchObject({ tipo: 'ticket', ot_vinculada: null });
    expect(por.get(conAbierta.id)).toMatchObject({
      tipo: 'ot_facturable',
      ot_vinculada: { id: reciente.id, codigo: reciente.codigo, tipo: 'facturable' },
    });
    expect(por.get(soloCerrada.id)).toMatchObject({
      tipo: 'ot_interna',
      ot_vinculada: { id: cerrada2.id, tipo: 'interna' },
    });
  });

  it('con_ot y tipo filtran (también en el Tablero)', async () => {
    const { agente } = await como('lectura');
    const sinOt = await crearTicket();
    const cancelada = await crearTicket();
    await crearOt(cancelada.id, { etapa: 'cancelada' });
    const interna = await crearTicket();
    await crearOt(interna.id, { tipo: 'interna' });
    const facturable = await crearTicket();
    await crearOt(facturable.id, { tipo: 'facturable' });
    const ids = (r: { body: { datos: { id: number }[] } }) =>
      r.body.datos.map((t) => t.id).sort((a, b) => a - b);
    const orden = (...n: number[]) => [...n].sort((a, b) => a - b);

    expect(ids(await agente.get('/api/tickets?con_ot=true'))).toEqual(
      orden(interna.id, facturable.id),
    );
    expect(ids(await agente.get('/api/tickets?con_ot=false'))).toEqual(
      orden(sinOt.id, cancelada.id),
    );
    expect(ids(await agente.get('/api/tickets?tipo=ot_interna'))).toEqual([interna.id]);
    expect(ids(await agente.get('/api/tickets?tipo=ticket'))).toEqual(
      orden(sinOt.id, cancelada.id),
    );
    expect(ids(await agente.get('/api/tickets?tipo=ot_interna,ot_facturable'))).toEqual(
      orden(interna.id, facturable.id),
    );

    const tablero = await agente.get('/api/tickets/tablero?tipo=ot_facturable');
    expect(tablero.status).toBe(200);
    expect(tablero.body.map((t: { id: number }) => t.id)).toEqual([facturable.id]);
    const conOt = await agente.get('/api/tickets/tablero?con_ot=true');
    expect(conOt.body).toHaveLength(2);
  });

  it('TicketSalida.ots trae todas las OT (incluida la cancelada), la más nueva primero', async () => {
    const { agente } = await como('lectura');
    const t = await crearTicket({ cliente_id: (await crearCliente()).id });
    const a = await crearOt(t.id, { tipo: 'interna' });
    const b = await crearOt(t.id, { etapa: 'cancelada' });
    const r = await agente.get(`/api/tickets/${t.id}`);
    expect(r.status).toBe(200);
    expect(r.body.ots.map((o: { id: number }) => o.id)).toEqual([b.id, a.id]);
    expect(r.body.ots[0]).toMatchObject({
      codigo: b.codigo,
      etapa: 'cancelada',
      tipo: 'facturable',
      resolvio_ticket: null,
      cerrada_en: null,
    });
  });
});

describe('numeración de OT conectada a la tabla', () => {
  it('fuenteNumeros.ot refleja las OT reales', async () => {
    const t = await crearTicket();
    await crearOt(t.id, { numero: 300 });
    await crearOt(t.id, { numero: 301 });
    const r = await enTransaccion(async (tx) => ({
      ultimo: await fuenteNumeros.ultimoUsado(tx, 'ot'),
      existe: await fuenteNumeros.existe(tx, 'ot', 300),
      noExiste: await fuenteNumeros.existe(tx, 'ot', 302),
    }));
    expect(r).toEqual({ ultimo: 301, existe: true, noExiste: false });
  });

  it('GET /api/config/numeracion refleja ot.ultimo_usado real', async () => {
    const { agente } = await como('admin');
    const t = await crearTicket();
    await crearOt(t.id, { numero: 777 });
    const r = await agente.get('/api/config/numeracion');
    expect(r.status).toBe(200);
    expect(r.body.ot.ultimo_usado).toBe(777);
  });
});
