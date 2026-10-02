import { describe, expect, it } from 'vitest';
import {
  crearAviso,
  crearUsuario,
  crearVinculoTelegram,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura' = 'tecnico') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const hace = (min: number): Date => new Date(Date.now() - min * 60_000);

describe('GET /api/avisos', () => {
  it('lista solo los míos, más recientes primero, con el actor y los no leídos', async () => {
    const { agente, usuario } = await como();
    const otro = await crearUsuario({ nombre: 'Camila Rojas' });
    const ajeno = await crearUsuario();
    const viejo = await crearAviso(usuario.id, {
      texto: 'viejo',
      creado_en: hace(30),
      leido: true,
    });
    const nuevo = await crearAviso(usuario.id, {
      texto: 'nuevo',
      creado_en: hace(5),
      actor_id: otro.id,
    });
    await crearAviso(ajeno.id, { texto: 'de otro' });
    const r = await agente.get('/api/avisos');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 2, pagina: 1, por_pagina: 50, no_leidos: 1 });
    expect(r.body.datos.map((a: { id: number }) => a.id)).toEqual([
      Number(nuevo.id),
      Number(viejo.id),
    ]);
    expect(r.body.datos[0]).toMatchObject({
      texto: 'nuevo',
      tipo: 'mencion',
      evento: 'mencion',
      entidad: 'ticket',
      leido: false,
      leido_en: null,
      telegram: null,
      actor: { id: otro.id, nombre: 'Camila Rojas', iniciales: 'CR' },
    });
    expect(r.body.datos[1]).toMatchObject({ leido: true, actor: null });
    expect(r.body.datos[1].leido_en).not.toBeNull();
  });

  it('filtra por menciones, asignaciones y vencimientos', async () => {
    const { agente, usuario } = await como();
    await crearAviso(usuario.id, { evento: 'mencion', tipo: 'mencion' });
    await crearAviso(usuario.id, { evento: 'asignacion', tipo: 'ticket_asignado' });
    await crearAviso(usuario.id, { evento: 'vence_pronto', tipo: 'vence_pronto' });
    await crearAviso(usuario.id, { evento: 'vencio', tipo: 'vencio' });
    await crearAviso(usuario.id, { evento: 'estado_ticket', tipo: 'estado_ticket' });
    const tipos = async (filtro: string): Promise<string[]> =>
      (await agente.get(`/api/avisos?filtro=${filtro}`)).body.datos
        .map((a: { tipo: string }) => a.tipo)
        .sort();
    expect(await tipos('todos')).toHaveLength(5);
    expect(await tipos('menciones')).toEqual(['mencion']);
    expect(await tipos('asignaciones')).toEqual(['ticket_asignado']);
    expect(await tipos('vencimientos')).toEqual(['vence_pronto', 'vencio']);
    // `no_leidos` no depende del filtro
    expect((await agente.get('/api/avisos?filtro=menciones')).body.no_leidos).toBe(5);
  });

  it('solo_no_leidos y paginación', async () => {
    const { agente, usuario } = await como();
    for (let i = 0; i < 5; i++) await crearAviso(usuario.id, { creado_en: hace(10 - i) });
    await crearAviso(usuario.id, { leido: true });
    expect((await agente.get('/api/avisos?solo_no_leidos=true')).body).toMatchObject({
      total: 5,
      no_leidos: 5,
    });
    const p2 = await agente.get('/api/avisos?por_pagina=4&pagina=2');
    expect(p2.body).toMatchObject({ total: 6, pagina: 2, por_pagina: 4 });
    expect(p2.body.datos).toHaveLength(2);
  });

  it('muestra el estado del envío por Telegram', async () => {
    const { agente, usuario } = await como();
    const a = await crearAviso(usuario.id);
    await dataSource.query(
      `INSERT INTO aviso_envio (aviso_id, canal, estado) VALUES ($1, 'telegram', 'enviado')`,
      [a.id],
    );
    const r = await agente.get('/api/avisos');
    expect(r.body.datos[0].telegram).toBe('enviado');
  });

  it('un aviso con en_app = false no se lista ni cuenta', async () => {
    const { agente, usuario } = await como();
    await crearAviso(usuario.id, { en_app: false });
    await crearAviso(usuario.id);
    const r = await agente.get('/api/avisos');
    expect(r.body).toMatchObject({ total: 1, no_leidos: 1 });
    expect((await agente.get('/api/avisos/no-leidos')).body).toEqual({ no_leidos: 1 });
  });
});

describe('GET /api/avisos/no-leidos', () => {
  it('cuenta solo mis no leídos', async () => {
    const { agente, usuario } = await como();
    const ajeno = await crearUsuario();
    await crearAviso(usuario.id);
    await crearAviso(usuario.id);
    await crearAviso(usuario.id, { leido: true });
    await crearAviso(ajeno.id);
    const r = await agente.get('/api/avisos/no-leidos');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ no_leidos: 2 });
  });
});

describe('POST /api/avisos/:id/leer y /leer-todos', () => {
  it('marca leído, es idempotente y conserva el primer leido_en', async () => {
    const { agente, usuario } = await como();
    const a = await crearAviso(usuario.id);
    const r = await agente.post(`/api/avisos/${a.id}/leer`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: Number(a.id), leido: true });
    const otra = await agente.post(`/api/avisos/${a.id}/leer`);
    expect(otra.status).toBe(200);
    expect(otra.body.leido_en).toBe(r.body.leido_en);
  });

  it('leer-todos marca solo los míos y devuelve la cantidad', async () => {
    const { agente, usuario } = await como();
    const ajeno = await crearUsuario();
    await crearAviso(usuario.id);
    await crearAviso(usuario.id);
    await crearAviso(usuario.id, { leido: true });
    await crearAviso(usuario.id, { en_app: false });
    const propio = await crearAviso(ajeno.id);
    const r = await agente.post('/api/avisos/leer-todos');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ marcados: 2 });
    expect((await agente.get('/api/avisos/no-leidos')).body).toEqual({ no_leidos: 0 });
    const [fila] = await dataSource.query(`SELECT leido_en FROM aviso WHERE id = $1`, [propio.id]);
    expect(fila.leido_en).toBeNull();
  });

  it('un id inexistente o no numérico: 404 y 400', async () => {
    const { agente } = await como();
    expect((await agente.post('/api/avisos/999999/leer')).status).toBe(404);
    expect((await agente.post('/api/avisos/abc/leer')).status).toBe(400);
  });
});

describe('preferencias', () => {
  it('GET devuelve 9 filas con los valores por defecto del diseño', async () => {
    const { agente } = await como();
    const r = await agente.get('/api/yo/avisos/preferencias');
    expect(r.status).toBe(200);
    expect(r.body.telegram_vinculado).toBe(false);
    expect(r.body.filas).toHaveLength(9);
    const por = Object.fromEntries(
      r.body.filas.map((f: { evento: string; app: boolean; telegram: boolean }) => [f.evento, f]),
    );
    expect(por.asignacion).toMatchObject({ app: true, telegram: true });
    expect(por.estado_ticket).toMatchObject({ app: true, telegram: false });
    expect(por.seguimiento).toMatchObject({ app: true, telegram: false });
    expect(por.resumen_diario).toMatchObject({ app: false, telegram: true });
    expect(r.body.filas[0]).not.toHaveProperty('correo');
  });

  it('PUT cambia solo las filas enviadas y GET las refleja; telegram_vinculado sigue al vínculo', async () => {
    const { agente, usuario } = await como();
    const r = await agente.put('/api/yo/avisos/preferencias').send({
      filas: [
        { evento: 'estado_ticket', app: false, telegram: true },
        { evento: 'resumen_diario', app: false, telegram: false },
      ],
    });
    expect(r.status).toBe(200);
    const por = Object.fromEntries(
      r.body.filas.map((f: { evento: string; app: boolean; telegram: boolean }) => [f.evento, f]),
    );
    expect(por.estado_ticket).toMatchObject({ app: false, telegram: true });
    expect(por.resumen_diario).toMatchObject({ app: false, telegram: false });
    expect(por.mencion).toMatchObject({ app: true, telegram: true });
    expect(r.body.telegram_vinculado).toBe(false);
    // el resumen diario nunca guarda una fila `app`
    const filas = await dataSource.query(
      `SELECT evento, canal FROM preferencia_aviso WHERE usuario_id = $1 AND evento = 'resumen_diario'`,
      [usuario.id],
    );
    expect(filas).toEqual([{ evento: 'resumen_diario', canal: 'telegram' }]);

    await crearVinculoTelegram(usuario.id);
    const g = await agente.get('/api/yo/avisos/preferencias');
    expect(g.body.telegram_vinculado).toBe(true);
    expect(
      g.body.filas.find((f: { evento: string }) => f.evento === 'estado_ticket'),
    ).toMatchObject({
      app: false,
      telegram: true,
    });
  });

  it('PUT repetido actualiza en vez de duplicar', async () => {
    const { agente, usuario } = await como();
    const fila = (telegram: boolean) => ({
      filas: [{ evento: 'mencion', app: true, telegram }],
    });
    await agente.put('/api/yo/avisos/preferencias').send(fila(false));
    await agente.put('/api/yo/avisos/preferencias').send(fila(true));
    const filas = await dataSource.query(
      `SELECT canal, activo FROM preferencia_aviso WHERE usuario_id = $1 AND evento = 'mencion' ORDER BY canal`,
      [usuario.id],
    );
    expect(filas).toEqual([
      { canal: 'app', activo: true },
      { canal: 'telegram', activo: true },
    ]);
  });
});
