import { NOMBRES_EVENTOS_DOMINIO, type NombreEventoDominio } from '@zydesk/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearTicket, crearUsuario } from '../../../test/fabricas.js';
import { conectarDespachador, esperarDespachos } from '../../avisos/despachador.js';
import { dataSource } from '../../config/db.js';
import { eventosDominio } from '../eventos/dominio.js';
import { ejecutarVencimientos } from './vencimientos.js';

beforeAll(() => conectarDespachador());

const desde = (horas: number): Date => new Date(Date.now() + horas * 3_600_000);

let publicados: [NombreEventoDominio, unknown][] = [];
const oyentes: [NombreEventoDominio, (d: unknown) => void][] = [];
beforeEach(() => {
  publicados = [];
  for (const nombre of NOMBRES_EVENTOS_DOMINIO) {
    const fn = (d: unknown): void => void publicados.push([nombre, d]);
    oyentes.push([nombre, fn]);
    eventosDominio.on(nombre, fn);
  }
});
afterEach(() => {
  for (const [nombre, fn] of oyentes.splice(0)) eventosDominio.off(nombre, fn);
});

const avisos = (usuario_id: number): Promise<{ tipo: string; entidad_id: number }[]> =>
  dataSource.query(`SELECT tipo, entidad_id FROM aviso WHERE usuario_id = $1 ORDER BY id`, [
    usuario_id,
  ]);

describe('tickets.vencimientos', () => {
  it('fecha_limite en 2 h: publica vence_pronto y crea el aviso del responsable principal', async () => {
    const principal = await crearUsuario();
    const limite = desde(2);
    const t = await crearTicket({
      estado: 'en_curso',
      principal_id: principal.id,
      fecha_limite: limite,
    });
    expect(await ejecutarVencimientos('job-1')).toEqual({ vence_pronto: 1, vencio: 0 });
    await esperarDespachos();
    expect(publicados).toEqual([
      ['ticket.vence_pronto', { ticket_id: t.id, fecha_limite: limite.toISOString() }],
    ]);
    expect(await avisos(principal.id)).toEqual([{ tipo: 'vence_pronto', entidad_id: t.id }]);
  });

  it('una segunda y tercera ejecución no crean avisos nuevos', async () => {
    const principal = await crearUsuario();
    await crearTicket({ estado: 'en_curso', principal_id: principal.id, fecha_limite: desde(2) });
    await crearTicket({ estado: 'en_curso', principal_id: principal.id, fecha_limite: desde(-1) });
    for (let i = 0; i < 3; i++) {
      await ejecutarVencimientos();
      await esperarDespachos();
    }
    const filas = await avisos(principal.id);
    expect(filas.map((f) => f.tipo).sort()).toEqual(['vence_pronto', 'vencio']);
  });

  it('fecha_limite hace 1 h: publica vencio', async () => {
    const principal = await crearUsuario();
    const limite = desde(-1);
    const t = await crearTicket({
      estado: 'nuevo',
      principal_id: principal.id,
      fecha_limite: limite,
    });
    expect(await ejecutarVencimientos()).toEqual({ vence_pronto: 0, vencio: 1 });
    await esperarDespachos();
    expect(publicados).toEqual([
      ['ticket.vencio', { ticket_id: t.id, fecha_limite: limite.toISOString() }],
    ]);
    expect(await avisos(principal.id)).toEqual([{ tipo: 'vencio', entidad_id: t.id }]);
  });

  it('ticket cerrado o sin fecha límite: nada', async () => {
    const principal = await crearUsuario();
    await crearTicket({
      estado: 'resuelto',
      principal_id: principal.id,
      fecha_limite: desde(2),
    });
    await crearTicket({
      estado: 'descartado',
      principal_id: principal.id,
      fecha_limite: desde(-2),
    });
    await crearTicket({ estado: 'en_curso', principal_id: principal.id, fecha_limite: null });
    expect(await ejecutarVencimientos()).toEqual({ vence_pronto: 0, vencio: 0 });
    expect(publicados).toEqual([]);
  });

  it('fecha_limite en 30 h: nada (24 h de reloj, B2)', async () => {
    const principal = await crearUsuario();
    await crearTicket({ estado: 'en_curso', principal_id: principal.id, fecha_limite: desde(30) });
    expect(await ejecutarVencimientos()).toEqual({ vence_pronto: 0, vencio: 0 });
    expect(publicados).toEqual([]);
  });

  it('vencido hace 8 días: no se vuelve a avisar', async () => {
    const principal = await crearUsuario();
    await crearTicket({
      estado: 'en_curso',
      principal_id: principal.id,
      fecha_limite: desde(-8 * 24),
    });
    expect(await ejecutarVencimientos()).toEqual({ vence_pronto: 0, vencio: 0 });
    expect(publicados).toEqual([]);
  });

  it('no escribe en ticket ni deja evento', async () => {
    const principal = await crearUsuario();
    const t = await crearTicket({
      estado: 'en_curso',
      principal_id: principal.id,
      fecha_limite: desde(2),
    });
    const antes = (
      await dataSource.query(`SELECT actualizado_en FROM ticket WHERE id = $1`, [t.id])
    )[0];
    await ejecutarVencimientos();
    await esperarDespachos();
    const despues = (
      await dataSource.query(`SELECT actualizado_en FROM ticket WHERE id = $1`, [t.id])
    )[0];
    expect(despues.actualizado_en).toEqual(antes.actualizado_en);
    expect(await dataSource.query(`SELECT 1 FROM evento`)).toEqual([]);
  });

  it('si cambia la fecha límite, la clave cambia y se avisa de nuevo', async () => {
    const principal = await crearUsuario();
    const t = await crearTicket({
      estado: 'en_curso',
      principal_id: principal.id,
      fecha_limite: desde(2),
    });
    await ejecutarVencimientos();
    await esperarDespachos();
    await dataSource.query(`UPDATE ticket SET fecha_limite = $2 WHERE id = $1`, [t.id, desde(3)]);
    await ejecutarVencimientos();
    await esperarDespachos();
    expect(await avisos(principal.id)).toHaveLength(2);
  });
});
