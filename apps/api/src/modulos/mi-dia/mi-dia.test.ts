import { describe, expect, it } from 'vitest';
import {
  crearAviso,
  crearCliente,
  crearOt,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';

const appMiDia = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura' = 'tecnico') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(appMiDia(), usuario)) };
}

const dias = (n: number): Date => new Date(Date.now() + n * 86_400_000);
const hoySantiago = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const ids = (lista: { id: number }[]): number[] => lista.map((x) => x.id);

describe('GET /api/mi-dia (spec fase 6 §10)', () => {
  it('técnico: conteos { 2, 1, 0, 1, 1, 1 } y las listas de cada cuadro', async () => {
    const { agente, usuario } = await como();
    const otro = await crearUsuario();
    const hoy1 = await crearTicket({ principal_id: usuario.id, fecha_limite: new Date() });
    const hoy2 = await crearTicket({ otros_ids: [usuario.id], fecha_limite: new Date() });
    const ayer = await crearTicket({ principal_id: usuario.id, fecha_limite: dias(-1) });
    const detenido = await crearTicket({
      principal_id: usuario.id,
      creado_en: dias(-9),
      actualizado_en: dias(-5),
    });
    // tarea abierta en una OT del técnico y otra en un ticket cerrado (no aparece)
    const ticketOt = await crearTicket({ principal_id: otro.id });
    const ot = await crearOt(ticketOt.id, { etapa: 'en_ejecucion', tipo: 'interna' });
    const tareaOt = await crearTarea(
      { ot_id: ot.id },
      { responsable_id: usuario.id, titulo: 'Tarea en OT' },
    );
    const cerrado = await crearTicket({ estado: 'resuelto', principal_id: otro.id });
    await crearTarea(cerrado.id, { responsable_id: usuario.id });
    // 2 menciones, una leída
    const mencionado = await crearAviso(usuario.id, { actor_id: otro.id });
    await crearAviso(usuario.id, { leido: true });

    const r = await agente.get('/api/mi-dia');
    expect(r.status).toBe(200);
    expect(r.body.fecha).toBe(hoySantiago());
    expect(r.body.conteos).toEqual({
      vencen_hoy: 2,
      vencidos: 1,
      por_aprobar: 0,
      menciones: 1,
      tareas: 1,
      detenidos: 1,
    });
    expect(ids(r.body.vencen_hoy)).toEqual([hoy1.id, hoy2.id].sort((a, b) => a - b));
    expect(ids(r.body.vencidos)).toEqual([ayer.id]);
    expect(ids(r.body.detenidos)).toEqual([detenido.id]);
    expect(ids(r.body.menciones)).toEqual([Number(mencionado.id)]);
    expect(r.body.menciones[0]).toMatchObject({
      tipo: 'mencion',
      leido: false,
      actor: { id: otro.id },
      telegram: null,
    });
    expect(r.body.tareas).toHaveLength(1);
    expect(r.body.tareas[0]).toMatchObject({
      id: tareaOt.id,
      ot_id: ot.id,
      ticket_id: null,
      responsable: { id: usuario.id },
      destino: { tipo: 'ot', id: ot.id, codigo: ot.codigo, titulo: ot.titulo },
    });
    expect(r.body.por_aprobar).toEqual([]);
  });

  it('un ticket que vence hoy no se repite en detenidos ni los vencidos con actividad vieja', async () => {
    const { agente, usuario } = await como();
    const venceHoy = await crearTicket({
      principal_id: usuario.id,
      fecha_limite: new Date(),
      creado_en: dias(-9),
      actualizado_en: dias(-8),
    });
    const vencidoViejo = await crearTicket({
      principal_id: usuario.id,
      fecha_limite: dias(-3),
      creado_en: dias(-9),
      actualizado_en: dias(-8),
    });
    const r = await agente.get('/api/mi-dia');
    expect(ids(r.body.vencen_hoy)).toEqual([venceHoy.id]);
    expect(ids(r.body.vencidos)).toEqual([vencidoViejo.id]);
    expect(r.body.detenidos).toEqual([]);
  });

  it('detenidos incluye en espera, ordena por el más antiguo y recorta a 10 sin perder el total', async () => {
    const { agente, usuario } = await como();
    const espera = await crearTicket({
      principal_id: usuario.id,
      estado: 'en_espera',
      creado_en: dias(-30),
      actualizado_en: dias(-20),
    });
    for (let i = 0; i < 11; i++) {
      await crearTicket({
        principal_id: usuario.id,
        creado_en: dias(-30),
        actualizado_en: dias(-10 - i),
      });
    }
    // reciente (hace 2 días) y cerrado: no cuentan
    await crearTicket({ principal_id: usuario.id, actualizado_en: dias(-2) });
    await crearTicket({
      principal_id: usuario.id,
      estado: 'resuelto',
      creado_en: dias(-30),
      actualizado_en: dias(-20),
    });
    const r = await agente.get('/api/mi-dia');
    expect(r.body.conteos.detenidos).toBe(12);
    expect(r.body.detenidos).toHaveLength(10);
    expect(r.body.detenidos[0].id).toBe(espera.id);
  });

  it('coordinación con aprobador_id en una OT interna en borrador → por_aprobar con 1; técnico → []', async () => {
    const coord = await como('coordinacion');
    const tecnico = await como('tecnico');
    const t = await crearTicket();
    const cliente = await crearCliente();
    const ot = await crearOt(t.id, {
      tipo: 'interna',
      etapa: 'borrador',
      aprobador_id: coord.usuario.id,
      cliente_id: cliente.id,
    });
    // misma OT con el técnico como aprobador: sigue sin verla (sin `ots.aprobar`)
    const t2 = await crearTicket();
    await crearOt(t2.id, { tipo: 'interna', etapa: 'borrador', aprobador_id: tecnico.usuario.id });
    // una facturable en borrador o ya en ejecución no cuenta
    await crearOt(t.id, { tipo: 'facturable', etapa: 'borrador', aprobador_id: coord.usuario.id });
    await crearOt(t.id, { tipo: 'interna', etapa: 'en_ejecucion', aprobador_id: coord.usuario.id });

    const c = await coord.agente.get('/api/mi-dia');
    expect(c.body.conteos.por_aprobar).toBe(1);
    expect(c.body.por_aprobar).toHaveLength(1);
    expect(c.body.por_aprobar[0]).toMatchObject({
      id: ot.id,
      por_aprobar: true,
      esperando_cliente: false,
    });

    const tec = await tecnico.agente.get('/api/mi-dia');
    expect(tec.status).toBe(200);
    expect(tec.body.por_aprobar).toEqual([]);
    expect(tec.body.conteos.por_aprobar).toBe(0);
  });

  it('lectura → 200 con listas vacías', async () => {
    const { agente } = await como('lectura');
    await crearTicket({ fecha_limite: new Date() });
    const r = await agente.get('/api/mi-dia');
    expect(r.status).toBe(200);
    expect(r.body.conteos).toEqual({
      vencen_hoy: 0,
      vencidos: 0,
      por_aprobar: 0,
      menciones: 0,
      tareas: 0,
      detenidos: 0,
    });
  });

  it('las tareas van por fecha (las sin fecha al final), máx. 20, con el total sin recorte', async () => {
    const { agente, usuario } = await como();
    const t = await crearTicket();
    const sinFecha = await crearTarea(t.id, { responsable_id: usuario.id });
    const tardia = await crearTarea(t.id, { responsable_id: usuario.id, fecha: '2031-01-02' });
    const temprana = await crearTarea(t.id, { responsable_id: usuario.id, fecha: '2031-01-01' });
    await crearTarea(t.id, { responsable_id: usuario.id, hecha: true });
    await crearTarea(t.id, { responsable_id: null });
    for (let i = 0; i < 20; i++) {
      await crearTarea(t.id, { responsable_id: usuario.id, fecha: '2031-02-01' });
    }
    const r = await agente.get('/api/mi-dia');
    expect(r.body.conteos.tareas).toBe(23);
    expect(r.body.tareas).toHaveLength(20);
    expect(ids(r.body.tareas).slice(0, 2)).toEqual([temprana.id, tardia.id]);
    expect(ids(r.body.tareas)).not.toContain(sinFecha.id);
  });

  it('las menciones: solo no leídas, en_app y de tipo mencion, máx. 10, las más nuevas primero', async () => {
    const { agente, usuario } = await como();
    const apagada = await crearAviso(usuario.id, { en_app: false });
    const asignacion = await crearAviso(usuario.id, {
      evento: 'asignacion',
      tipo: 'ticket_asignado',
    });
    const ajena = await crearAviso((await crearUsuario()).id);
    const nuevas: number[] = [];
    for (let i = 0; i < 11; i++) {
      nuevas.push(Number((await crearAviso(usuario.id, { creado_en: dias(-1 + i / 100) })).id));
    }
    const r = await agente.get('/api/mi-dia');
    expect(r.body.conteos.menciones).toBe(11);
    expect(r.body.menciones).toHaveLength(10);
    expect(ids(r.body.menciones)).toEqual(nuevas.slice(1).reverse());
    for (const excluido of [apagada.id, asignacion.id, ajena.id].map(Number)) {
      expect(ids(r.body.menciones)).not.toContain(excluido);
    }
  });
});
