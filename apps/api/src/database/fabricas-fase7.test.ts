import { describe, expect, it } from 'vitest';
import { crearCategoria, crearOt, crearTicket } from '../../test/fabricas.js';
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

describe('fábricas de la Fase 7', () => {
  it('crearTicket({ horas_estimadas: 6 }) deja 6.00 y por defecto NULL', async () => {
    const t = await crearTicket({ horas_estimadas: 6 });
    const sin = await crearTicket();
    const filas: { id: number; horas_estimadas: string | null }[] = await dataSource.query(
      `SELECT id, horas_estimadas FROM ticket WHERE id = ANY($1)`,
      [[t.id, sin.id]],
    );
    expect(filas.find((f) => f.id === t.id)!.horas_estimadas).toBe('6.00');
    expect(filas.find((f) => f.id === sin.id)!.horas_estimadas).toBeNull();
  });

  it('crearCategoria acepta plazo_resolucion', async () => {
    const plazo = {
      urgente: { valor: 1, unidad: 'dias' },
      alta: { valor: 1, unidad: 'dias' },
      media: { valor: 2, unidad: 'dias' },
      baja: { valor: 3, unidad: 'dias' },
    } as const;
    const c = await crearCategoria({ plazo_resolucion: plazo });
    const [fila]: { plazo_resolucion: unknown }[] = await dataSource.query(
      `SELECT plazo_resolucion FROM categoria WHERE id = $1`,
      [c.id],
    );
    expect(fila!.plazo_resolucion).toEqual(plazo);
  });

  it('una OT facturada sin n_factura viola el CHECK; con facturada_en y n_factura se inserta', async () => {
    const ticket = await crearTicket();
    const ot = await crearOt(ticket.id, { etapa: 'cerrada', estado_facturacion: 'facturada' });
    expect(
      await codigoError(dataSource.query(`UPDATE ot SET n_factura = NULL WHERE id = $1`, [ot.id])),
    ).toBe(CHECK);

    const facturada_en = new Date('2026-09-15T15:00:00Z');
    const otra = await crearOt(ticket.id, {
      etapa: 'cerrada',
      estado_facturacion: 'facturada',
      facturada_en,
      n_factura: 'F-777',
      cerrada_en: new Date('2026-09-10T15:00:00Z'),
    });
    const [fila]: { n_factura: string; facturada_en: Date; cerrada_en: Date }[] =
      await dataSource.query(`SELECT n_factura, facturada_en, cerrada_en FROM ot WHERE id = $1`, [
        otra.id,
      ]);
    expect(fila!.n_factura).toBe('F-777');
    expect(fila!.facturada_en.toISOString()).toBe(facturada_en.toISOString());
    expect(fila!.cerrada_en.toISOString()).toBe('2026-09-10T15:00:00.000Z');
  });

  it('la migración 14 deja los cuatro índices', async () => {
    const filas: { indexname: string }[] = await dataSource.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)`,
      [
        [
          'ticket_cerrado_en_idx',
          'registro_horas_fecha_idx',
          'ot_facturada_en_idx',
          'ticket_responsable_usuario_idx',
        ],
      ],
    );
    expect(filas.map((f) => f.indexname).sort()).toEqual([
      'ot_facturada_en_idx',
      'registro_horas_fecha_idx',
      'ticket_cerrado_en_idx',
      'ticket_responsable_usuario_idx',
    ]);
  });
});
