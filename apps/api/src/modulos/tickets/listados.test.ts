import { describe, expect, it } from 'vitest';
import {
  crearCategoria,
  crearCliente,
  crearMensaje,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura' = 'tecnico') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const dias = (n: number): Date => new Date(Date.now() + n * 86_400_000);
type Resumen = { id: number; codigo: string };
const ids = (r: { body: { datos: Resumen[] } }): number[] =>
  r.body.datos.map((t) => t.id).sort((a, b) => a - b);
const ordenados = (...n: number[]): number[] => [...n].sort((a, b) => a - b);

describe('GET /api/tickets: filtros (§5.2)', () => {
  it('forma paginada y TicketResumen completo', async () => {
    const { agente } = await como('lectura');
    const cliente = await crearCliente();
    const principal = await crearUsuario({ nombre: 'Ana Pérez' });
    const otro = await crearUsuario({ nombre: 'Beto Soto' });
    const t = await crearTicket({
      cliente_id: cliente.id,
      principal_id: principal.id,
      otros_ids: [otro.id],
    });
    const r = await agente.get('/api/tickets');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 1, pagina: 1, por_pagina: 50 });
    expect(r.body.datos[0]).toMatchObject({
      id: t.id,
      codigo: t.codigo,
      cliente: { id: cliente.id, nombre: cliente.nombre, es_interno: false },
      estado: 'nuevo',
      prioridad: 'media',
      vencido: false,
      vence_hoy: false,
      tiene_correo: false,
      n_mensajes: 0,
      duplicado_de: null,
      tipo: 'ticket',
      ot_vinculada: null,
      archivado_en: null,
    });
    expect(
      r.body.datos[0].responsables.map(
        (x: { nombre: string; principal: boolean; iniciales: string }) => [
          x.nombre,
          x.principal,
          x.iniciales,
        ],
      ),
    ).toEqual([
      ['Ana Pérez', true, 'AP'],
      ['Beto Soto', false, 'BS'],
    ]);
  });

  it('q: número (con y sin prefijo), código, asunto y solicitante', async () => {
    const { agente } = await como();
    const t1048 = await crearTicket({
      numero: 1048,
      asunto: 'Error al emitir facturas desde el ERP',
    });
    await crearTicket({ numero: 1049, asunto: 'Copia de respaldo 1048 fallida' });
    const porSolicitante = await crearTicket({ numero: 1050, solicitante_nombre: 'Paula Herrera' });
    // solo número: no mezcla con asuntos que contienen el número
    expect(ids(await agente.get('/api/tickets?q=1048'))).toEqual([t1048.id]);
    expect(ids(await agente.get('/api/tickets?q=TK-1048'))).toEqual([t1048.id]);
    expect(ids(await agente.get('/api/tickets?q=tk-1048'))).toEqual([t1048.id]);
    expect(ids(await agente.get('/api/tickets?q=facturas'))).toEqual([t1048.id]);
    expect(ids(await agente.get('/api/tickets?q=herrera'))).toEqual([porSolicitante.id]);
    expect((await agente.get('/api/tickets?q=99999999999')).body.total).toBe(0);
    // los comodines del usuario no se interpretan
    expect((await agente.get('/api/tickets?q=%25')).body.total).toBe(0);
  });

  it('estado y prioridad admiten listas separadas por comas; valores inválidos → 400', async () => {
    const { agente } = await como();
    const a = await crearTicket({ estado: 'nuevo', prioridad: 'urgente' });
    const b = await crearTicket({ estado: 'en_curso', prioridad: 'alta' });
    const c = await crearTicket({ estado: 'resuelto', prioridad: 'baja' });
    expect(ids(await agente.get('/api/tickets?estado=nuevo,en_curso'))).toEqual(
      ordenados(a.id, b.id),
    );
    expect(ids(await agente.get('/api/tickets?estado=resuelto'))).toEqual([c.id]);
    expect(ids(await agente.get('/api/tickets?prioridad=urgente,baja'))).toEqual(
      ordenados(a.id, c.id),
    );
    expect((await agente.get('/api/tickets?estado=foo')).status).toBe(400);
  });

  it('responsable_id, solo_mios (responsable o seguidor), sin_asignar', async () => {
    const { agente, usuario } = await como();
    const otro = await crearUsuario();
    const resp = await crearTicket({ principal_id: usuario.id });
    const otros = await crearTicket({ principal_id: otro.id, otros_ids: [usuario.id] });
    const seguido = await crearTicket({ principal_id: otro.id });
    await dataSource.query(`INSERT INTO ticket_seguidor (ticket_id, usuario_id) VALUES ($1, $2)`, [
      seguido.id,
      usuario.id,
    ]);
    const ajeno = await crearTicket({ principal_id: otro.id });
    const sin = await crearTicket();
    expect(ids(await agente.get(`/api/tickets?responsable_id=${otro.id}`))).toEqual(
      ordenados(otros.id, seguido.id, ajeno.id),
    );
    expect(ids(await agente.get('/api/tickets?solo_mios=true'))).toEqual(
      ordenados(resp.id, otros.id, seguido.id),
    );
    expect((await agente.get('/api/tickets?solo_mios=false')).body.total).toBe(5);
    expect(ids(await agente.get('/api/tickets?sin_asignar=true'))).toEqual([sin.id]);
  });

  it('cliente_id y categoria_id', async () => {
    const { agente } = await como();
    const c1 = await crearCliente();
    const cat = await crearCategoria();
    const a = await crearTicket({ cliente_id: c1.id, categoria_id: cat.id });
    await crearTicket({ cliente_id: (await crearCliente()).id });
    await crearTicket();
    expect(ids(await agente.get(`/api/tickets?cliente_id=${c1.id}`))).toEqual([a.id]);
    expect(ids(await agente.get(`/api/tickets?categoria_id=${cat.id}`))).toEqual([a.id]);
  });

  it('archivados: false (defecto) oculta los archivados; true muestra solo esos', async () => {
    const { agente } = await como();
    const activo = await crearTicket();
    const cerrado = await crearTicket({ estado: 'resuelto', cerrado_en: dias(-2) });
    const archivado = await crearTicket({
      estado: 'resuelto',
      cerrado_en: dias(-20),
      archivado_en: dias(-13),
    });
    expect(ids(await agente.get('/api/tickets'))).toEqual(ordenados(activo.id, cerrado.id));
    expect(ids(await agente.get('/api/tickets?archivados=false'))).toEqual(
      ordenados(activo.id, cerrado.id),
    );
    const solo = await agente.get('/api/tickets?archivados=true');
    expect(ids(solo)).toEqual([archivado.id]);
    expect(solo.body.datos[0].archivado_en).not.toBeNull();
  });

  it('vencidos y vencen_hoy (Santiago); los cerrados no cuentan; banderas en el resumen', async () => {
    const { agente } = await como();
    const [{ hoy_tarde }] = await dataSource.query(
      `SELECT (((now() AT TIME ZONE 'America/Santiago')::date + time '23:59:59') AT TIME ZONE 'America/Santiago') AS hoy_tarde`,
    );
    const vencido = await crearTicket({ fecha_limite: dias(-2) });
    const hoy = await crearTicket({ fecha_limite: hoy_tarde });
    const futuro = await crearTicket({ fecha_limite: dias(5) });
    await crearTicket(); // sin fecha
    const cerradoVencido = await crearTicket({
      estado: 'resuelto',
      fecha_limite: dias(-3),
      cerrado_en: dias(-1),
    });
    const v = await agente.get('/api/tickets?vencidos=true');
    expect(ids(v)).toEqual([vencido.id]);
    expect(v.body.datos[0]).toMatchObject({ vencido: true, vence_hoy: false });
    const h = await agente.get('/api/tickets?vencen_hoy=true');
    expect(ids(h)).toEqual([hoy.id]);
    expect(h.body.datos[0]).toMatchObject({ vencido: false, vence_hoy: true });
    const todos = await agente.get('/api/tickets');
    const por = Object.fromEntries(
      todos.body.datos.map((t: { id: number; vencido: boolean; vence_hoy: boolean }) => [t.id, t]),
    );
    expect(por[futuro.id]).toMatchObject({ vencido: false, vence_hoy: false });
    expect(por[cerradoVencido.id]).toMatchObject({ vencido: false, vence_hoy: false });
  });

  it('n_mensajes cuenta solo mensajes (no eventos), tiene_correo y duplicado_de', async () => {
    const { agente, usuario } = await como();
    const t = await crearTicket();
    await crearMensaje(t.id, { autor_id: usuario.id });
    await crearMensaje(t.id, { autor_id: usuario.id, tipo: 'nota_interna' });
    await dataSource.query(
      `INSERT INTO evento (entidad, entidad_id, accion) VALUES ('ticket', $1, 'creado')`,
      [String(t.id)],
    );
    await dataSource.query(
      `INSERT INTO correo_adjunto (ticket_id, origen, cuerpo) VALUES ($1, 'texto', 'x')`,
      [t.id],
    );
    const dup = await crearTicket({ estado: 'duplicado' });
    const r = await agente.get('/api/tickets?por_pagina=200');
    const por = Object.fromEntries(
      r.body.datos.map(
        (x: { id: number; n_mensajes: number; tiene_correo: boolean; duplicado_de: unknown }) => [
          x.id,
          x,
        ],
      ),
    );
    expect(por[t.id]).toMatchObject({ n_mensajes: 2, tiene_correo: true });
    expect(por[dup.id].duplicado_de).toMatchObject({ id: dup.duplicado_de_id });
  });

  it('orden: -actualizado_en (defecto), -creado_en, fecha_limite (nulos al final), prioridad', async () => {
    const { agente } = await como();
    const antiguo = await crearTicket({
      prioridad: 'baja',
      fecha_limite: dias(3),
      creado_en: dias(-10),
      actualizado_en: dias(-1),
    });
    const medio = await crearTicket({
      prioridad: 'urgente',
      fecha_limite: dias(9),
      creado_en: dias(-5),
      actualizado_en: dias(-5),
    });
    const sinFecha = await crearTicket({
      prioridad: 'alta',
      creado_en: dias(-1),
      actualizado_en: dias(-9),
    });
    const lista = async (orden?: string) =>
      (await agente.get(`/api/tickets${orden ? `?orden=${orden}` : ''}`)).body.datos.map(
        (t: Resumen) => t.id,
      );
    expect(await lista()).toEqual([antiguo.id, medio.id, sinFecha.id]);
    expect(await lista('-creado_en')).toEqual([sinFecha.id, medio.id, antiguo.id]);
    expect(await lista('fecha_limite')).toEqual([antiguo.id, medio.id, sinFecha.id]);
    expect(await lista('prioridad')).toEqual([medio.id, sinFecha.id, antiguo.id]);
    expect((await agente.get('/api/tickets?orden=numero')).status).toBe(400);
  });

  it('paginación: por_pagina y pagina con total', async () => {
    const { agente } = await como();
    for (let i = 0; i < 5; i++) await crearTicket();
    const r = await agente.get('/api/tickets?por_pagina=2&pagina=3&orden=-creado_en');
    expect(r.body).toMatchObject({ total: 5, pagina: 3, por_pagina: 2 });
    expect(r.body.datos).toHaveLength(1);
  });

  it('lectura puede listar', async () => {
    const { agente } = await como('lectura');
    expect((await agente.get('/api/tickets')).status).toBe(200);
  });
});

describe('GET /api/tickets/tablero', () => {
  it('sin paginar, excluye archivados, incluye cerrados no archivados; orden prioridad y luego actualización', async () => {
    const { agente } = await como('lectura');
    const baja = await crearTicket({ prioridad: 'baja', actualizado_en: dias(-1) });
    const urgenteViejo = await crearTicket({ prioridad: 'urgente', actualizado_en: dias(-5) });
    const urgenteNuevo = await crearTicket({ prioridad: 'urgente', actualizado_en: dias(-1) });
    const cerrado = await crearTicket({
      estado: 'resuelto',
      prioridad: 'media',
      cerrado_en: dias(-2),
    });
    await crearTicket({ estado: 'resuelto', cerrado_en: dias(-20), archivado_en: dias(-13) });
    const r = await agente.get('/api/tickets/tablero');
    expect(r.status).toBe(200);
    expect(r.body.map((t: Resumen) => t.id)).toEqual([
      urgenteNuevo.id,
      urgenteViejo.id,
      cerrado.id,
      baja.id,
    ]);
  });

  it('respeta los filtros del tablero (solo_mios, cliente, q, vencidos)', async () => {
    const { agente, usuario } = await como();
    const cliente = await crearCliente();
    const mio = await crearTicket({
      principal_id: usuario.id,
      cliente_id: cliente.id,
      fecha_limite: dias(-1),
    });
    await crearTicket();
    expect(
      (await agente.get('/api/tickets/tablero?solo_mios=true')).body.map((t: Resumen) => t.id),
    ).toEqual([mio.id]);
    expect((await agente.get(`/api/tickets/tablero?cliente_id=${cliente.id}`)).body).toHaveLength(
      1,
    );
    expect((await agente.get('/api/tickets/tablero?vencidos=true')).body).toHaveLength(1);
    expect((await agente.get(`/api/tickets/tablero?q=${mio.numero}`)).body).toHaveLength(1);
    // el tablero ignora estado/archivados/orden/paginación
    expect(
      (await agente.get('/api/tickets/tablero?estado=resuelto&archivados=true')).body,
    ).toHaveLength(2);
  });
});
