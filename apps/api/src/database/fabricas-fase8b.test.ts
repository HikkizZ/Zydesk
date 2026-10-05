import { TarifasSalida } from '@zydesk/shared';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import {
  crearCliente,
  crearCotizacion,
  crearIndicadorUf,
  crearOt,
  crearTarifaCliente,
  crearTicket,
  guardarTarifasGlobales,
} from '../../test/fabricas.js';
import { dataSource } from '../config/db.js';
import { hoyEnSantiago } from '../core/fechas.js';
import { Uf1791000000015 } from './migraciones/1791000000015-uf.js';

async function codigoError(consulta: Promise<unknown>): Promise<string | undefined> {
  try {
    await consulta;
  } catch (err) {
    return (err as { driverError?: { code?: string } }).driverError?.code;
  }
  return undefined;
}

const CHECK = '23514';

describe('fábricas y migración 15 (Fase 8b)', () => {
  it('deja 15 migraciones aplicadas e indicador_uf existe', async () => {
    const [fila]: { n: string }[] = await dataSource.query(`SELECT count(*) AS n FROM migracion`);
    expect(Number(fila!.n)).toBe(15);
    const [t]: { existe: boolean }[] = await dataSource.query(
      `SELECT to_regclass('public.indicador_uf') IS NOT NULL AS existe`,
    );
    expect(t!.existe).toBe(true);
  });

  it('tarifa_cliente.moneda es CLP por defecto', async () => {
    const cliente = await crearCliente();
    await dataSource.query(
      `INSERT INTO tarifa_cliente (cliente_id, concepto, valor) VALUES ($1, 'hora_normal', 1000)`,
      [cliente.id],
    );
    await crearTarifaCliente(cliente.id, 'hora_extendida', { moneda: 'UF', valor: 0.8 });
    const filas: { concepto: string; moneda: string; valor: string }[] = await dataSource.query(
      `SELECT concepto, moneda, valor FROM tarifa_cliente WHERE cliente_id = $1 ORDER BY concepto`,
      [cliente.id],
    );
    expect(filas).toEqual([
      { concepto: 'hora_extendida', moneda: 'UF', valor: '0.80' },
      { concepto: 'hora_normal', moneda: 'CLP', valor: '1000.00' },
    ]);
  });

  it('crearIndicadorUf usa hoy, 41098.15 y semilla; no pisa una fila existente', async () => {
    const fila = await crearIndicadorUf();
    expect(fila).toEqual({ fecha: hoyEnSantiago(), valor: 41098.15, fuente: 'semilla' });
    const otra = await crearIndicadorUf({ valor: 50000, fuente: 'boostr' });
    expect(otra.valor).toBe(41098.15);
  });

  it('indicador_uf rechaza fuente manual y valor no positivo', async () => {
    const insertar = (valor: number, fuente: string) =>
      dataSource.query(
        `INSERT INTO indicador_uf (fecha, valor, fuente) VALUES ('2026-01-01', $1, $2)`,
        [valor, fuente],
      );
    expect(await codigoError(insertar(41000, 'manual'))).toBe(CHECK);
    expect(await codigoError(insertar(0, 'boostr'))).toBe(CHECK);
  });

  it('los CHECK de valor_uf_fuente y valor_uf_fecha', async () => {
    const ot = await crearOt((await crearTicket()).id);
    expect(
      await codigoError(
        dataSource.query(
          `INSERT INTO cotizacion (ot_id, version, codigo, estado, fecha_emision, validez_dias, moneda, valor_uf, iva_pct)
           VALUES ($1, 1, 'COT-X', 'borrador', '2026-10-05', 30, 'CLP', 41098.15, 19)`,
          [ot.id],
        ),
      ),
    ).toBe(CHECK);
    expect(
      await codigoError(
        crearCotizacion(ot.id, {
          valor_uf: 41098.15,
          valor_uf_fuente: 'manual',
          valor_uf_fecha: '2026-10-05',
        }),
      ),
    ).toBe(CHECK);
    const ok = await crearCotizacion(ot.id, {
      version: 2,
      estado: 'rechazada',
      valor_uf: 41098.15,
      valor_uf_fuente: 'boostr',
      valor_uf_fecha: '2026-10-05',
    });
    expect(ok.valor_uf_fuente).toBe('boostr');
    const manual = await crearCotizacion(ot.id, {
      version: 3,
      estado: 'rechazada',
      valor_uf: 40000,
    });
    expect(manual.valor_uf_fuente).toBe('manual');
    expect(manual.valor_uf_fecha).toBeNull();
    const sin = await crearCotizacion(ot.id, { version: 4, estado: 'rechazada' });
    expect(sin.valor_uf_fuente).toBeNull();
  });

  it('la clave tarifas sembrada y guardarTarifasGlobales cumplen TarifasSalida', async () => {
    const [sembrada]: { valor: unknown }[] = await dataSource.query(
      `SELECT valor FROM configuracion WHERE clave = 'tarifas'`,
    );
    expect(TarifasSalida.safeParse(sembrada!.valor).success).toBe(true);
    await guardarTarifasGlobales({ hora_normal: { moneda: 'UF', valor: 0.8 } });
    const [fila]: { valor: unknown }[] = await dataSource.query(
      `SELECT valor FROM configuracion WHERE clave = 'tarifas'`,
    );
    const tarifas = TarifasSalida.parse(fila!.valor);
    expect(tarifas.hora_normal).toEqual({ moneda: 'UF', valor: 0.8 });
    expect(tarifas.iva_pct).toBe(19);
  });

  it('up convierte el jsonb de tarifas y down lo deja numérico (dentro de una transacción)', async () => {
    const { dataSourceOwner } = await import('./data-source-owner.js');
    const { url } = dataSourceOwner.options as { url: string };
    const ds = new DataSource({ type: 'postgres', url, logging: false });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    try {
      await qr.startTransaction();
      const migracion = new Uf1791000000015();
      await migracion.down(qr);
      // down: sin columna moneda, sin indicador_uf
      const [a]: { n: string }[] = await qr.query(
        `SELECT count(*) AS n FROM information_schema.columns
          WHERE table_name = 'tarifa_cliente' AND column_name = 'moneda'`,
      );
      expect(Number(a!.n)).toBe(0);
      await qr.query(
        `UPDATE configuracion SET valor = valor || '{"hora_normal": 38000, "costo_interno": 18000}'::jsonb WHERE clave = 'tarifas'`,
      );
      await migracion.up(qr);
      const [conv]: { valor: Record<string, unknown> }[] = await qr.query(
        `SELECT valor FROM configuracion WHERE clave = 'tarifas'`,
      );
      expect(conv!.valor.hora_normal).toEqual({ moneda: 'CLP', valor: 38000 });
      expect(conv!.valor.hora_extendida).toBeNull();
      expect(conv!.valor.costo_interno).toBe(18000);
      await migracion.down(qr);
      const [rev]: { valor: Record<string, unknown> }[] = await qr.query(
        `SELECT valor FROM configuracion WHERE clave = 'tarifas'`,
      );
      expect(rev!.valor.hora_normal).toBe(38000);
      expect(rev!.valor.costo_interno).toBe(18000);
    } finally {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      await qr.release();
      await ds.destroy();
    }
  });
});
