import { TZDate } from '@date-fns/tz';
import { ZONA } from '@zydesk/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  crearCategoria,
  crearCliente,
  crearDepartamento,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { cargarCalendario } from '../departamentos/departamentos.service.js';

// Cuenta cuántas veces se carga un calendario sin cambiar su comportamiento.
vi.mock('../departamentos/departamentos.service.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../departamentos/departamentos.service.js')>();
  return { ...original, cargarCalendario: vi.fn(original.cargarCalendario) };
});

const app = () => crearApp({ comprobarBd: async () => true });
const local = (y: number, m: number, d: number, h: number, min = 0): Date =>
  new Date(new TZDate(y, m - 1, d, h, min, ZONA).getTime());
const dias = (n: number): Date => new Date(Date.now() + n * 86_400_000);
const porId = <T extends { id: number }>(lista: T[], id: number): T | undefined =>
  lista.find((x) => x.id === id);

async function comoLectura() {
  const usuario = await crearUsuario({ rol: 'lectura' });
  return ingresarComo(app(), usuario);
}

// Responsable principal con departamento (jornada L-V 08:30-18:00, colación 13:00-14:00).
async function conDepartamento() {
  const departamento = await crearDepartamento();
  const principal = await crearUsuario({ departamento_id: departamento.id });
  return { departamento, principal };
}

describe('plazo_habil en TicketResumen y TicketSalida (fase 10 §5)', () => {
  it('total = horas_habiles de POST /api/plazos/calcular; el cerrado queda congelado', async () => {
    const { departamento, principal } = await conDepartamento();
    const { agente } = await comoLectura();
    const desde = local(2026, 9, 21, 9); // lunes
    const calculo = await agente.post('/api/plazos/calcular').send({
      desde: desde.toISOString(),
      plazo: { valor: 12, unidad: 'horas' },
      departamento_id: departamento.id,
    });
    expect(calculo.status).toBe(200);
    const cerrado = local(2026, 9, 22, 9);
    const t = await crearTicket({
      estado: 'resuelto',
      principal_id: principal.id,
      creado_en: desde,
      fecha_limite: new Date(calculo.body.hasta),
      cerrado_en: cerrado,
    });
    const r = await agente.get(`/api/tickets/${t.id}`);
    expect(r.status).toBe(200);
    expect(r.body.plazo_habil).toEqual({
      total: calculo.body.horas_habiles,
      restantes: 3.5, // martes 09:00 → 12:30
      calculado_en: cerrado.toISOString(),
    });
    expect(r.body.plazo_habil.total).toBe(12);
  });

  it('cerrado después del límite: restantes negativas y calculado_en = cerrado_en', async () => {
    const { principal } = await conDepartamento();
    const { agente } = await comoLectura();
    const cerrado = local(2026, 9, 23, 10);
    const t = await crearTicket({
      estado: 'resuelto',
      principal_id: principal.id,
      creado_en: local(2026, 9, 21, 9),
      fecha_limite: local(2026, 9, 22, 10),
      cerrado_en: cerrado,
    });
    const r = await agente.get(`/api/tickets/${t.id}`);
    expect(r.body.plazo_habil.calculado_en).toBe(cerrado.toISOString());
    expect(r.body.plazo_habil.restantes).toBeLessThan(0);
    expect(r.body.vencido).toBe(false);
  });

  it('abierto con holgura: restantes ≤ total y calculado_en = ahora', async () => {
    const { principal } = await conDepartamento();
    const { agente } = await comoLectura();
    const antes = Date.now();
    const t = await crearTicket({
      principal_id: principal.id,
      creado_en: dias(-1),
      fecha_limite: dias(30),
    });
    const r = await agente.get(`/api/tickets/${t.id}`);
    const p = r.body.plazo_habil;
    expect(p.total).toBeGreaterThan(0);
    expect(p.restantes).toBeGreaterThan(0);
    expect(p.restantes).toBeLessThanOrEqual(p.total);
    expect(Date.parse(p.calculado_en)).toBeGreaterThanOrEqual(antes);
  });

  it('abierto vencido: restantes < 0 y vencido true', async () => {
    const { principal } = await conDepartamento();
    const { agente } = await comoLectura();
    const t = await crearTicket({
      principal_id: principal.id,
      creado_en: dias(-20),
      fecha_limite: dias(-10),
    });
    const r = await agente.get(`/api/tickets/${t.id}`);
    expect(r.body.vencido).toBe(true);
    expect(r.body.plazo_habil.restantes).toBeLessThan(0);
    expect(r.body.plazo_habil.total).toBeGreaterThan(0);
  });

  it('sin principal con departamento usa el responsable por defecto de la categoría', async () => {
    const departamento = await crearDepartamento();
    const porDefecto = await crearUsuario({ departamento_id: departamento.id });
    const categoria = await crearCategoria({ responsable_defecto_id: porDefecto.id });
    const sinDepto = await crearUsuario();
    const { agente } = await comoLectura();
    const t = await crearTicket({
      categoria_id: categoria.id,
      principal_id: sinDepto.id,
      creado_en: local(2026, 9, 21, 9),
      fecha_limite: local(2026, 9, 21, 12),
      estado: 'resuelto',
      cerrado_en: local(2026, 9, 21, 10),
    });
    const r = await agente.get(`/api/tickets/${t.id}`);
    expect(r.body.plazo_habil).toMatchObject({ total: 3, restantes: 2 });
  });

  // Seguridad (spec fase 10 §11): plazo_habil solo lleva números y un instante; nunca el departamento,
  // el horario ni los feriados con que se calculó.
  it('plazo_habil no expone departamento_id, horario ni feriados', async () => {
    const { principal } = await conDepartamento();
    const { agente } = await comoLectura();
    const t = await crearTicket({
      principal_id: principal.id,
      creado_en: dias(-1),
      fecha_limite: dias(3),
    });
    const detalle = await agente.get(`/api/tickets/${t.id}`);
    expect(detalle.status).toBe(200);
    expect(Object.keys(detalle.body.plazo_habil).sort()).toEqual([
      'calculado_en',
      'restantes',
      'total',
    ]);
    const lista = await agente.get('/api/tickets');
    const enLista = porId<{ id: number; plazo_habil: unknown }>(lista.body.datos, t.id);
    for (const plazo of [detalle.body.plazo_habil, enLista?.plazo_habil]) {
      const texto = JSON.stringify(plazo);
      expect(texto).not.toContain('departamento');
      expect(texto).not.toContain('horario');
      expect(texto).not.toContain('feriado');
    }
  });

  it('null sin fecha límite o sin departamento en la cadena', async () => {
    const { principal } = await conDepartamento();
    const sinDepto = await crearUsuario();
    const { agente } = await comoLectura();
    const sinFecha = await crearTicket({ principal_id: principal.id });
    const sinCalendario = await crearTicket({ principal_id: sinDepto.id, fecha_limite: dias(2) });
    const sinResponsable = await crearTicket({ fecha_limite: dias(2) });
    for (const t of [sinFecha, sinCalendario, sinResponsable]) {
      const r = await agente.get(`/api/tickets/${t.id}`);
      expect(r.status).toBe(200);
      expect(r.body.plazo_habil).toBeNull();
    }
  });

  it('la lista, el tablero, la lista del cliente y Mi día incluyen el campo', async () => {
    const { principal } = await conDepartamento();
    const cliente = await crearCliente();
    const { agente } = await comoLectura();
    const t = await crearTicket({
      principal_id: principal.id,
      cliente_id: cliente.id,
      creado_en: dias(-5),
      fecha_limite: dias(5),
    });
    const lista = await agente.get('/api/tickets');
    expect(
      porId<{ id: number; plazo_habil: unknown }>(lista.body.datos, t.id)?.plazo_habil,
    ).toMatchObject({
      restantes: expect.any(Number),
    });
    const tablero = await agente.get('/api/tickets/tablero');
    expect(
      porId<{ id: number; plazo_habil: unknown }>(tablero.body, t.id)?.plazo_habil,
    ).not.toBeNull();
    const delCliente = await agente.get(`/api/tickets?cliente_id=${cliente.id}&por_pagina=20`);
    expect(delCliente.body.datos[0].plazo_habil).not.toBeNull();

    const vencido = await crearTicket({
      principal_id: principal.id,
      creado_en: dias(-9),
      fecha_limite: dias(-3),
    });
    const sesion = await ingresarComo(app(), principal);
    const miDia = await sesion.agente.get('/api/mi-dia');
    expect(miDia.status).toBe(200);
    expect(
      porId<{ id: number; plazo_habil: { restantes: number } }>(miDia.body.vencidos, vencido.id)
        ?.plazo_habil.restantes,
    ).toBeLessThan(0);
  });

  it('un calendario por departamento y petición; las consultas no crecen con la lista', async () => {
    const a = await conDepartamento();
    const b = await conDepartamento();
    const { agente } = await comoLectura();
    const alta = async (n: number) => {
      for (let i = 0; i < n; i++) {
        await crearTicket({
          principal_id: i % 2 === 0 ? a.principal.id : b.principal.id,
          creado_en: dias(-3),
          fecha_limite: dias(3 + i),
        });
      }
    };
    const medir = async (): Promise<{ consultas: number; calendarios: number }> => {
      vi.mocked(cargarCalendario).mockClear();
      const espia = vi.spyOn(dataSource.manager, 'query');
      const r = await agente.get('/api/tickets?por_pagina=200');
      expect(r.status).toBe(200);
      const consultas = espia.mock.calls.length;
      espia.mockRestore();
      return { consultas, calendarios: vi.mocked(cargarCalendario).mock.calls.length };
    };
    await alta(4);
    const pocos = await medir();
    await alta(36);
    const muchos = await medir();
    expect(pocos.calendarios).toBe(2);
    expect(muchos.calendarios).toBe(2);
    expect(muchos.consultas).toBe(pocos.consultas);
  });

  it('Mi día comparte los calendarios entre sus tres listas', async () => {
    const { principal } = await conDepartamento();
    const sesion = await ingresarComo(app(), principal);
    await crearTicket({
      principal_id: principal.id,
      creado_en: dias(-9),
      fecha_limite: new Date(),
    });
    await crearTicket({ principal_id: principal.id, creado_en: dias(-9), fecha_limite: dias(-3) });
    await crearTicket({
      principal_id: principal.id,
      creado_en: dias(-9),
      actualizado_en: dias(-6),
      fecha_limite: dias(10),
    });
    vi.mocked(cargarCalendario).mockClear();
    const r = await sesion.agente.get('/api/mi-dia');
    expect(r.status).toBe(200);
    expect(r.body.vencen_hoy).toHaveLength(1);
    expect(r.body.vencidos).toHaveLength(1);
    expect(r.body.detenidos).toHaveLength(1);
    expect(vi.mocked(cargarCalendario).mock.calls.length).toBeLessThanOrEqual(2);
  });
});
