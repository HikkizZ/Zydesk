import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { dataSource } from '../../config/db.js';
import { contexto } from '../http/contexto.js';
import { registrarAuditoria } from './auditoria.js';
import { registrarCambios, registrarEvento } from './evento.js';
import { enTransaccion } from './transaccion.js';

describe('registrarCambios', () => {
  it('con 3 campos y 2 cambiados inserta 2 eventos con el req_id del contexto', async () => {
    const req_id = randomUUID();
    const n = await contexto.run({ req_id }, () =>
      enTransaccion((tx) =>
        registrarCambios(tx, {
          entidad: 'ticket',
          entidad_id: 7,
          actor: { id: null },
          antes: { estado: 'nuevo', prioridad: 'alta', titulo: 'a' },
          despues: { estado: 'en_curso', prioridad: 'alta', titulo: null },
          campos: ['estado', 'prioridad', 'titulo'],
          etiquetas: { estado: (v) => `E:${String(v)}` },
        }),
      ),
    );
    expect(n).toBe(2);
    const filas = await dataSource.query(
      `SELECT entidad_id, accion, campo, valor_anterior, valor_nuevo, req_id FROM evento ORDER BY id`,
    );
    expect(filas).toEqual([
      {
        entidad_id: '7',
        accion: 'cambio',
        campo: 'estado',
        valor_anterior: 'E:nuevo',
        valor_nuevo: 'E:en_curso',
        req_id,
      },
      {
        entidad_id: '7',
        accion: 'cambio',
        campo: 'titulo',
        valor_anterior: 'a',
        valor_nuevo: null,
        req_id,
      },
    ]);
  });

  it('compara arrays como conjuntos y fechas por valor', async () => {
    const n = await enTransaccion((tx) =>
      registrarCambios(tx, {
        entidad: 'ticket',
        entidad_id: 1,
        actor: { id: null },
        antes: { resp: [2, 1], fecha: new Date(1000) },
        despues: { resp: [1, 2], fecha: new Date(1000) },
        campos: ['resp', 'fecha'],
      }),
    );
    expect(n).toBe(0);
  });

  it('registrarEvento sin contexto deja req_id nulo y guarda datos', async () => {
    await enTransaccion((tx) =>
      registrarEvento(tx, {
        entidad: 'contador',
        entidad_id: 'ticket',
        actor: { id: null },
        accion: 'numeracion_cambiada',
        datos: { a: 1 },
      }),
    );
    const [fila] = await dataSource.query(`SELECT req_id, datos, autor_id FROM evento`);
    expect(fila).toEqual({ req_id: null, datos: { a: 1 }, autor_id: null });
  });
});

describe('registrarAuditoria', () => {
  it('con tx nula inserta con la ip y el req_id del contexto', async () => {
    const req_id = randomUUID();
    await contexto.run({ req_id, ip: '10.1.2.3' }, () =>
      registrarAuditoria(null, { accion: 'ingreso_fallido', detalle: { correo: 'a@b.cl' } }),
    );
    const [fila] = await dataSource.query(`SELECT accion, ip, req_id, detalle FROM auditoria`);
    expect(fila).toEqual({
      accion: 'ingreso_fallido',
      ip: '10.1.2.3',
      req_id,
      detalle: { correo: 'a@b.cl' },
    });
  });

  it('con tx se revierte junto con la transacción', async () => {
    await expect(
      enTransaccion(async (tx) => {
        await registrarAuditoria(tx, { accion: 'config_cambiada' });
        throw new Error('falla');
      }),
    ).rejects.toThrow('falla');
    const [fila] = await dataSource.query(`SELECT count(*) AS n FROM auditoria`);
    expect(fila.n).toBe('0');
  });
});
