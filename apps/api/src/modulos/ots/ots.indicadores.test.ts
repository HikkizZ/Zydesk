import { describe, expect, it } from 'vitest';
import {
  crearCliente,
  crearCotizacion,
  crearOt,
  crearRegistroHoras,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const hoySantiago = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
// 15 del mes anterior (siempre dentro de ese mes)
const mesPasado = (): string => {
  const [a, m] = hoySantiago().split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 2, 15)).toISOString().slice(0, 10);
};

async function sembrar() {
  const cliente = await crearCliente();
  const t = await crearTicket({ cliente_id: cliente.id });
  const autor = await crearUsuario();
  const conCliente = { cliente_id: cliente.id };
  // por facturar: cerrada con cotización aprobada de 680 000
  const porFacturar = await crearOt(t.id, { etapa: 'cerrada', ...conCliente });
  await crearCotizacion(porFacturar.id, {
    estado: 'aprobada',
    lineas: [{ cantidad: 1, precio_unitario: 680_000 }],
  });
  // esperando al cliente: cotizada con vigente enviada de 2 150 000
  const esperando = await crearOt(t.id, { etapa: 'cotizada', ...conCliente });
  await crearCotizacion(esperando.id, {
    estado: 'enviada',
    lineas: [{ cantidad: 1, precio_unitario: 2_150_000 }],
  });
  // cotizada con vigente en borrador: no cuenta como esperando
  const cotizadaBorrador = await crearOt(t.id, { etapa: 'cotizada', ...conCliente });
  await crearCotizacion(cotizadaBorrador.id, {
    estado: 'borrador',
    lineas: [{ cantidad: 1, precio_unitario: 999_000 }],
  });
  // dos en ejecución (una interna con horas)
  await crearOt(t.id, { etapa: 'en_ejecucion', ...conCliente });
  const interna = await crearOt(t.id, { tipo: 'interna', etapa: 'en_ejecucion' });
  await crearRegistroHoras(autor.id, { ot_id: interna.id, horas: 2 });
  await crearRegistroHoras(autor.id, { ot_id: interna.id, horas: 3, fecha: mesPasado() });
  return { porFacturar, esperando, cotizadaBorrador, interna };
}

describe('GET /api/ots/indicadores (spec fase 6 §12)', () => {
  it('coordinación: cuentas, montos y horas internas del mes', async () => {
    const { agente } = await como('coordinacion');
    await sembrar();
    const r = await agente.get('/api/ots/indicadores');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      por_facturar: { n: 1, neto: 680_000 },
      esperando_cliente: { n: 1, neto: 2_150_000 },
      en_ejecucion: 2,
      horas_internas_mes: 2,
    });
  });

  it('sin OT: ceros', async () => {
    const { agente } = await como('admin');
    const r = await agente.get('/api/ots/indicadores');
    expect(r.body).toEqual({
      por_facturar: { n: 0, neto: 0 },
      esperando_cliente: { n: 0, neto: 0 },
      en_ejecucion: 0,
      horas_internas_mes: 0,
    });
  });

  it('solo lectura (reportes.ver) ve los montos', async () => {
    const { agente } = await como('lectura');
    await sembrar();
    const r = await agente.get('/api/ots/indicadores');
    expect(r.status).toBe(200);
    expect(r.body.por_facturar.neto).toBe(680_000);
  });

  it('técnico: neto null en ambos, pero las cuentas sí', async () => {
    const { agente } = await como('tecnico');
    await sembrar();
    const r = await agente.get('/api/ots/indicadores');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      por_facturar: { n: 1, neto: null },
      esperando_cliente: { n: 1, neto: null },
      en_ejecucion: 2,
      horas_internas_mes: 2,
    });
  });

  it('GET /api/ots devuelve las etiquetas esperando_cliente y por_aprobar', async () => {
    const { agente, usuario } = await como('coordinacion');
    const { esperando, cotizadaBorrador, porFacturar } = await sembrar();
    const t = await crearTicket();
    const interna = await crearOt(t.id, {
      tipo: 'interna',
      etapa: 'borrador',
      aprobador_id: usuario.id,
    });
    const sinAprobador = await crearOt(t.id, { tipo: 'interna', etapa: 'borrador' });
    const r = await agente.get('/api/ots?por_pagina=100');
    const por = (id: number) => r.body.datos.find((o: { id: number }) => o.id === id);
    expect(por(esperando.id)).toMatchObject({ esperando_cliente: true, por_aprobar: false });
    expect(por(cotizadaBorrador.id)).toMatchObject({ esperando_cliente: false });
    expect(por(porFacturar.id)).toMatchObject({ esperando_cliente: false, por_aprobar: false });
    expect(por(interna.id)).toMatchObject({ esperando_cliente: false, por_aprobar: true });
    expect(por(sinAprobador.id)).toMatchObject({ por_aprobar: false });
  });

  it('sin sesión → 401', async () => {
    const r = await (await import('supertest')).default(app()).get('/api/ots/indicadores');
    expect(r.status).toBe(401);
  });
});
