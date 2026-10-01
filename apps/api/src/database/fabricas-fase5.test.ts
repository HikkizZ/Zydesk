import { describe, expect, it } from 'vitest';
import {
  crearMensaje,
  crearOt,
  crearRegistroHoras,
  crearTarea,
  crearTicket,
  crearUsuario,
} from '../../test/fabricas.js';
import { dataSource } from '../config/db.js';

async function codigoError(consulta: Promise<unknown>): Promise<string | undefined> {
  try {
    await consulta;
  } catch (err) {
    return (err as { driverError?: { code?: string } }).driverError?.code;
  }
  return undefined;
}

const CHECK = '23514';
const UNICO = '23505';

describe('fábricas de la Fase 5', () => {
  it('dos filas manuales iguales en la misma celda violan registro_horas_celda_manual_uq', async () => {
    const usuario = await crearUsuario();
    const ot = await crearOt((await crearTicket()).id);
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, fecha: '2026-09-28' });
    expect(
      await codigoError(crearRegistroHoras(usuario.id, { ot_id: ot.id, fecha: '2026-09-28' })),
    ).toBe(UNICO);
    // otra celda: otro día, otra tarea o otra descripción en "Sin ticket"
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, fecha: '2026-09-29' });
    const tarea = await crearTarea({ ot_id: ot.id });
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, tarea_id: tarea.id, fecha: '2026-09-28' });
    await crearRegistroHoras(usuario.id, { descripcion: 'Reunión', fecha: '2026-09-28' });
    await crearRegistroHoras(usuario.id, { descripcion: 'Capacitación', fecha: '2026-09-28' });
  });

  it('dos filas con mensaje_id distinto en la misma celda se aceptan', async () => {
    const usuario = await crearUsuario();
    const ot = await crearOt((await crearTicket()).id);
    const m1 = await crearMensaje({ ot_id: ot.id }, { autor_id: usuario.id, horas: 1 });
    const m2 = await crearMensaje({ ot_id: ot.id }, { autor_id: usuario.id, horas: 2 });
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, mensaje_id: m1.id, fecha: '2026-09-28' });
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, mensaje_id: m2.id, fecha: '2026-09-28' });
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, fecha: '2026-09-28' });
    const [{ n }] = await dataSource.query(
      `SELECT count(*)::int AS n FROM registro_horas WHERE usuario_id = $1`,
      [usuario.id],
    );
    expect(n).toBe(3);
  });

  it('tarea_id sin ot_id viola registro_horas_tarea_chk', async () => {
    const usuario = await crearUsuario();
    const ot = await crearOt((await crearTicket()).id);
    const tarea = await crearTarea({ ot_id: ot.id });
    const ticket = await crearTicket();
    expect(
      await codigoError(
        crearRegistroHoras(usuario.id, { ticket_id: ticket.id, tarea_id: tarea.id }),
      ),
    ).toBe(CHECK);
  });

  it('sin ticket, sin OT y sin descripción viola registro_horas_sin_ticket_chk', async () => {
    const usuario = await crearUsuario();
    expect(
      await codigoError(
        dataSource.query(
          `INSERT INTO registro_horas (usuario_id, fecha, horas) VALUES ($1, '2026-09-28', 1)`,
          [usuario.id],
        ),
      ),
    ).toBe(CHECK);
  });
});
