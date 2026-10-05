import { describe, expect, it } from 'vitest';
import {
  crearCotizacion,
  crearOt,
  crearPlantilla,
  crearTicket,
  fijarTarifas,
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

const UNICO = '23505';

const LINEAS_DISENO = [
  { cantidad: 3, precio_unitario: 38000, descuento_pct: 0 },
  { cantidad: 4, precio_unitario: 38000, descuento_pct: 0 },
  { cantidad: 2, precio_unitario: 45000, descuento_pct: 0 },
  { cantidad: 1, precio_unitario: 38000, descuento_pct: 0 },
  { cantidad: 1, precio_unitario: 90000, descuento_pct: 10 },
];

describe('fábricas de la Fase 4', () => {
  it('crearCotizacion con las 5 líneas del diseño deja neto 475000 y total 565250', async () => {
    const ot = await crearOt((await crearTicket()).id);
    const cot = await crearCotizacion(ot.id, { lineas: LINEAS_DISENO });
    expect(cot.codigo).toBe(`COT-${ot.codigo.replace('OT-', '')}`);
    expect(cot.version).toBe(1);
    expect(cot.estado).toBe('borrador');
    const [fila] = await dataSource.query(
      `SELECT subtotal, descuentos, neto, iva, total FROM cotizacion WHERE id = $1`,
      [cot.id],
    );
    expect(fila).toEqual({
      subtotal: '484000.00',
      descuentos: '9000.00',
      neto: '475000.00',
      iva: '90250.00',
      total: '565250.00',
    });
    const lineas = await dataSource.query(
      `SELECT total FROM linea_cotizacion WHERE cotizacion_id = $1 ORDER BY orden`,
      [cot.id],
    );
    expect(lineas.map((l: { total: string }) => Number(l.total))).toEqual([
      114000, 152000, 90000, 38000, 81000,
    ]);
  });

  it('numera las versiones y rellena lo que exigen los CHECK en cada estado', async () => {
    const ot = await crearOt((await crearTicket()).id);
    const estados = ['rechazada', 'reemplazada', 'enviada', 'aprobada', 'borrador'] as const;
    let version = 1;
    for (const estado of estados) {
      const cot = await crearCotizacion(ot.id, { estado, lineas: LINEAS_DISENO.slice(0, 1) });
      expect([cot.version, cot.estado]).toEqual([version++, estado]);
    }
    const uf = await crearCotizacion(ot.id, { estado: 'enviada', moneda: 'UF' });
    expect(uf.valor_uf).toBe(38000);
  });

  it('dos borradores en la misma OT violan cotizacion_borrador_uq', async () => {
    const ot = await crearOt((await crearTicket()).id);
    await crearCotizacion(ot.id);
    expect(await codigoError(crearCotizacion(ot.id))).toBe(UNICO);
  });

  it('dos aprobadas en la misma OT violan cotizacion_aprobada_uq', async () => {
    const ot = await crearOt((await crearTicket()).id);
    await crearCotizacion(ot.id, { estado: 'aprobada' });
    expect(await codigoError(crearCotizacion(ot.id, { estado: 'aprobada' }))).toBe(UNICO);
  });

  it('crearPlantilla crea líneas con precio null y el nombre es único sin distinguir mayúsculas', async () => {
    const p = await crearPlantilla({ nombre: 'Soporte', lineas: [{ cantidad: 2 }] });
    const lineas = await dataSource.query(
      `SELECT orden, cantidad, precio_unitario FROM plantilla_linea WHERE plantilla_id = $1`,
      [p.id],
    );
    expect(lineas).toEqual([{ orden: 1, cantidad: '2.00', precio_unitario: null }]);
    expect(await codigoError(crearPlantilla({ nombre: 'SOPORTE' }))).toBe(UNICO);
  });

  it('fijarTarifas fusiona con la semilla de la fábrica y es repetible', async () => {
    await fijarTarifas({ hora_normal: { moneda: 'CLP', valor: 40000 } });
    await fijarTarifas({ costo_interno: 15000 });
    const [fila] = await dataSource.query(
      `SELECT valor FROM configuracion WHERE clave = 'tarifas'`,
    );
    expect(fila.valor).toEqual({
      hora_normal: { moneda: 'CLP', valor: 38000 },
      hora_extendida: { moneda: 'CLP', valor: 45000 },
      hora_urgencia: null,
      traslado_km: null,
      costo_interno: 15000,
      iva_pct: 19,
      validez_dias_defecto: 30,
      condiciones_defecto: null,
    });
  });
});
