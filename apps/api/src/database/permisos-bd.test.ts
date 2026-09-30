import { describe, expect, it } from 'vitest';
import { dataSource } from '../config/db.js';
import { dataSourceOwner } from './data-source-owner.js';

async function codigoError(consulta: Promise<unknown>): Promise<string | undefined> {
  try {
    await consulta;
  } catch (err) {
    return (
      (err as { code?: string; driverError?: { code?: string } }).driverError?.code ??
      (err as { code?: string }).code
    );
  }
  return undefined;
}

describe('permisos de BD (ADR 0017)', () => {
  it('zydesk_app no puede UPDATE en evento ni DELETE en auditoria', async () => {
    await dataSource.query(
      `INSERT INTO evento (entidad, entidad_id, accion) VALUES ('contador', 'ticket', 'prueba')`,
    );
    await dataSource.query(`INSERT INTO auditoria (accion) VALUES ('ingreso_ok')`);
    expect(await codigoError(dataSource.query(`UPDATE evento SET accion = 'x'`))).toBe('42501');
    expect(await codigoError(dataSource.query(`DELETE FROM evento`))).toBe('42501');
    expect(await codigoError(dataSource.query(`UPDATE auditoria SET accion = 'x'`))).toBe('42501');
    expect(await codigoError(dataSource.query(`DELETE FROM auditoria`))).toBe('42501');
  });

  it('limpiar_auditoria() borra lo de más de un año y conserva lo reciente', async () => {
    await dataSourceOwner.initialize();
    try {
      await dataSourceOwner.query(
        `INSERT INTO auditoria (accion, creado_en) VALUES ('ingreso_ok', now() - interval '2 years')`,
      );
    } finally {
      await dataSourceOwner.destroy();
    }
    await dataSource.query(`INSERT INTO auditoria (accion) VALUES ('ingreso_ok')`);
    await dataSource.query(`SELECT limpiar_auditoria()`);
    const filas: { n: string }[] = await dataSource.query(`SELECT count(*) AS n FROM auditoria`);
    expect(filas[0]!.n).toBe('1');
  });
});
