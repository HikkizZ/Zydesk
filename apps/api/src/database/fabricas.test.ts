import { describe, expect, it } from 'vitest';
import { dataSource } from '../config/db.js';
import {
  crearCategoria,
  crearCliente,
  crearDepartamento,
  crearUsuario,
} from '../../test/fabricas.js';
import { Cliente } from '../modulos/clientes/cliente.entity.js';
import { ContratoBolsa } from '../modulos/clientes/contrato-bolsa.entity.js';
import { TarifaCliente } from '../modulos/clientes/tarifa-cliente.entity.js';
import { Feriado } from '../modulos/departamentos/feriado.entity.js';

describe('fábricas de prueba', () => {
  it('crean filas válidas y relacionadas', async () => {
    const depto = await crearDepartamento({ nombre: 'Soporte TI' });
    const usuario = await crearUsuario({ rol: 'admin', departamento_id: depto.id });
    const cliente = await crearCliente();
    const categoria = await crearCategoria({ responsable_defecto_id: usuario.id });

    expect(depto.id).toBeGreaterThan(0);
    expect(usuario.contrasena_hash).toMatch(/^\$argon2id\$/);
    expect(usuario.rol).toBe('admin');
    expect(cliente.activo).toBe(true);
    expect(categoria.plazo_resolucion.urgente).toEqual({ valor: 4, unidad: 'horas' });

    const [h] = await dataSource.query(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE activo)::int AS activos FROM horario_dia WHERE departamento_id = $1`,
      [depto.id],
    );
    expect(h).toEqual({ n: 7, activos: 5 });

    const leido = await dataSource.manager.findOneByOrFail(Cliente, { id: cliente.id });
    expect(leido.nombre).toBe(cliente.nombre);
  });

  it('respetan las restricciones de BD (correo y nombre únicos sin distinguir mayúsculas)', async () => {
    await crearUsuario({ correo: 'Ana@zydesk.test' });
    await expect(crearUsuario({ correo: 'ana@ZYDESK.test' })).rejects.toThrow();
    await crearCliente({ nombre: 'Viña Santa Clara' });
    await expect(crearCliente({ nombre: 'viña santa clara' })).rejects.toThrow();
  });

  it('mapea numeric a number y date a texto AAAA-MM-DD', async () => {
    const cliente = await crearCliente();
    await dataSource.manager.save(ContratoBolsa, {
      cliente_id: cliente.id,
      horas_mes: 20.5,
      vigente_desde: '2026-10-01',
      vigente_hasta: null,
      fecha_renovacion: null,
      notas: null,
    });
    await dataSource.manager.save(TarifaCliente, {
      cliente_id: cliente.id,
      concepto: 'hora_normal',
      valor: 35000.5,
    });
    const bolsa = await dataSource.manager.findOneByOrFail(ContratoBolsa, {
      cliente_id: cliente.id,
    });
    expect(bolsa.horas_mes).toBe(20.5);
    expect(bolsa.vigente_desde).toBe('2026-10-01');
    const tarifa = await dataSource.manager.findOneByOrFail(TarifaCliente, {
      cliente_id: cliente.id,
    });
    expect(tarifa.valor).toBe(35000.5);
    const feriado = await dataSource.manager.findOneByOrFail(Feriado, { fecha: '2026-01-01' });
    expect(feriado.departamento_id).toBeNull();
  });

  it('feriado: unicidad (fecha, departamento) tratando NULL como igual', async () => {
    await expect(
      dataSource.query(`INSERT INTO feriado (fecha, nombre) VALUES ('2026-01-01', 'Duplicado')`),
    ).rejects.toThrow();
  });
});
