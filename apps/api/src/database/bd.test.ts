import { describe, expect, it } from 'vitest';
import { crearApp } from '../app.js';
import { dataSource } from '../config/db.js';
import { verificar } from '../core/auth/contrasena.js';
import {
  CONTRASENA_PRUEBA,
  HASH_CONTRASENA_PRUEBA,
  crearArchivoPendiente,
  crearCliente,
  crearMensaje,
  crearOt,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../test/fabricas.js';
import { ordenarHijosAPadres, reiniciarBd } from '../../test/bd.js';

const app = (): ReturnType<typeof crearApp> => crearApp({ comprobarBd: async () => true });

describe('reiniciarBd', () => {
  it('vacía todas las tablas salvo la semilla base y reinicia las identidades', async () => {
    const usuario = await crearUsuario({ rol: 'admin' });
    const cliente = await crearCliente();
    const ticket = await crearTicket({ cliente_id: cliente.id, principal_id: usuario.id });
    const ot = await crearOt(ticket.id, { responsable_tecnico_id: usuario.id });
    await crearTarea({ ot_id: ot.id }, { responsable_id: usuario.id });
    await crearMensaje({ ot_id: ot.id }, { autor_id: usuario.id });
    await crearArchivoPendiente(usuario.id);
    await ingresarComo(app(), usuario, CONTRASENA_PRUEBA);

    await reiniciarBd();

    const tablas: { tablename: string }[] = await dataSource.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migracion'`,
    );
    const esperadas: Record<string, number> = { configuracion: 2, contador: 2, feriado: 33 };
    for (const { tablename } of tablas) {
      const [fila]: { n: number }[] = await dataSource.query(
        `SELECT count(*)::int AS n FROM "${tablename}"`,
      );
      expect(fila!.n, tablename).toBe(esperadas[tablename] ?? 0);
    }
    expect((await crearUsuario()).id).toBe(1);
  });

  it('el orden de borrado de las FK bloqueantes no tiene ciclos', async () => {
    const fks: { hija: string; padre: string }[] = await dataSource.query(
      `SELECT c.conrelid::regclass::text AS hija, c.confrelid::regclass::text AS padre
         FROM pg_constraint c WHERE c.contype = 'f' AND c.confdeltype IN ('a', 'r')`,
    );
    const tablas: { tablename: string }[] = await dataSource.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migracion'`,
    );
    expect(() =>
      ordenarHijosAPadres(
        tablas.map((t) => t.tablename),
        fks,
      ),
    ).not.toThrow();
  });

  it('ordenarHijosAPadres pone hijos antes que padres y detecta ciclos', () => {
    const orden = ordenarHijosAPadres(
      ['a', 'b', 'c'],
      [
        { hija: 'c', padre: 'b' },
        { hija: 'b', padre: 'a' },
        { hija: 'a', padre: 'a' },
      ],
    );
    expect(orden).toEqual(['c', 'b', 'a']);
    expect(() =>
      ordenarHijosAPadres(
        ['a', 'b'],
        [
          { hija: 'a', padre: 'b' },
          { hija: 'b', padre: 'a' },
        ],
      ),
    ).toThrow(/a, b/);
  });
});

describe('sesiones de prueba', () => {
  it('HASH_CONTRASENA_PRUEBA corresponde a CONTRASENA_PRUEBA', async () => {
    expect(await verificar(HASH_CONTRASENA_PRUEBA, CONTRASENA_PRUEBA)).toBe(true);
  });

  it('ingresarComo sin contraseña autentica y no deja auditoría', async () => {
    const usuario = await crearUsuario();
    const { agente } = await ingresarComo(app(), usuario);
    const res = await agente.get('/api/yo');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(usuario.id);
    const [fila]: { n: number }[] = await dataSource.query(
      `SELECT count(*)::int AS n FROM auditoria`,
    );
    expect(fila!.n).toBe(0);
  });

  it('ingresarComo con contraseña usa el ingreso real y deja ingreso_ok', async () => {
    const usuario = await crearUsuario();
    await ingresarComo(app(), usuario, CONTRASENA_PRUEBA);
    const [fila]: { n: number }[] = await dataSource.query(
      `SELECT count(*)::int AS n FROM auditoria WHERE accion = 'ingreso_ok'`,
    );
    expect(fila!.n).toBe(1);
  });
});
