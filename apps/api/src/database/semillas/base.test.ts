import { describe, expect, it } from 'vitest';
import { dataSource } from '../../config/db.js';
import { sembrarBase } from './base.js';

describe('sembrarBase', () => {
  it('es idempotente: dos ejecuciones dejan 33 feriados, 2 contadores y la marca', async () => {
    await sembrarBase(dataSource.manager);
    await sembrarBase(dataSource.manager);
    const [f] = await dataSource.query(
      `SELECT count(*)::int AS n FROM feriado WHERE departamento_id IS NULL`,
    );
    expect(f.n).toBe(33);
    const contadores = await dataSource.query(
      `SELECT clave, prefijo, inicial, digitos, modo, valor FROM contador ORDER BY clave`,
    );
    expect(contadores).toEqual([
      { clave: 'ot', prefijo: 'OT-', inicial: 200, digitos: 4, modo: 'correlativo', valor: 199 },
      {
        clave: 'ticket',
        prefijo: 'TK-',
        inicial: 1000,
        digitos: 4,
        modo: 'correlativo',
        valor: 999,
      },
    ]);
    const config = await dataSource.query(`SELECT clave, valor FROM configuracion ORDER BY clave`);
    expect(config).toEqual([
      { clave: 'logo', valor: null },
      { clave: 'nombre_app', valor: 'Zydesk' },
    ]);
  });

  it('no pisa valores ya modificados', async () => {
    await dataSource.query(`UPDATE contador SET valor = 1050 WHERE clave = 'ticket'`);
    await sembrarBase(dataSource.manager);
    const [c] = await dataSource.query(`SELECT valor FROM contador WHERE clave = 'ticket'`);
    expect(c.valor).toBe(1050);
  });
});
