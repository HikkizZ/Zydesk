import { describe, expect, it } from 'vitest';
import {
  crearOt,
  crearRegistroHoras,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const hoy = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

const cuentas = async () => {
  const [c] = await dataSource.query(
    `SELECT (SELECT count(*) FROM evento)::int AS eventos, (SELECT count(*) FROM auditoria)::int AS auditoria`,
  );
  return c as { eventos: number; auditoria: number };
};

// Spec fase 5 §6: la planilla no genera `evento` ni `auditoria`; `registro_horas` es el registro.
describe('cobertura de eventos de la planilla de horas', () => {
  it('GET, POST, PATCH y DELETE no crean filas en evento ni auditoria', async () => {
    const usuario = await crearUsuario({ rol: 'tecnico' });
    const { agente } = await ingresarComo(crearApp({ comprobarBd: async () => true }), usuario);
    const t = await crearTicket();
    const ot = await crearOt((await crearTicket()).id, { etapa: 'en_ejecucion' });
    const existente = await crearRegistroHoras(usuario.id, {
      ot_id: ot.id,
      fecha: '2026-09-28',
    });
    const antes = await cuentas();

    expect((await agente.get('/api/horas')).status).toBe(200);
    const c = await agente.post('/api/horas').send({ fecha: hoy(), ticket_id: t.id, horas: 1 });
    expect(c.status).toBe(201);
    expect((await agente.patch(`/api/horas/${c.body.id}`).send({ horas: 2 })).status).toBe(200);
    expect((await agente.patch(`/api/horas/${existente.id}`).send({ horas: 3 })).status).toBe(200);
    expect((await agente.delete(`/api/horas/${c.body.id}`)).status).toBe(204);

    expect(await cuentas()).toEqual(antes);
  });
});
