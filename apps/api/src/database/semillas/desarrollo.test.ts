import { rutValido } from '@zydesk/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { ErrorSemilla, sembrarDesarrollo } from './desarrollo.js';

const CLAVE = 'Semilla.Dev.2026';

async function contar(tabla: string, where = 'true'): Promise<number> {
  const [{ n }] = await dataSource.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE ${where}`);
  return n;
}

describe('sembrarDesarrollo', () => {
  it('es idempotente: dos ejecuciones dejan 11 usuarios, 3 departamentos, 8 clientes, 6 categorías y 1 bolsa', async () => {
    await sembrarDesarrollo(CLAVE);
    await sembrarDesarrollo(CLAVE);
    expect(await contar('usuario')).toBe(11);
    expect(await contar('departamento')).toBe(3);
    expect(await contar('horario_dia')).toBe(21);
    expect(await contar('cliente')).toBe(8);
    expect(await contar('cliente', 'es_interno')).toBe(4);
    expect(await contar('categoria')).toBe(6);
    expect(await contar('contrato_bolsa')).toBe(1);
    expect(await contar('tarifa_cliente')).toBe(2);
    expect(await contar('contacto')).toBe(4);
  });

  it('el RUT sembrado es válido y hikki ingresa con la contraseña de semilla, sin pendientes', async () => {
    await sembrarDesarrollo(CLAVE);
    const [c] = await dataSource.query(`SELECT rut FROM cliente WHERE rut IS NOT NULL`);
    expect(rutValido(c.rut)).toBe(true);
    const agente = request
      .agent(crearApp({ comprobarBd: async () => true }))
      .set('X-Requested-With', 'Zydesk');
    const res = await agente
      .post('/api/auth/ingresar')
      .send({ correo: 'hikki@zydesk.local', contrasena: CLAVE });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      rol: 'admin',
      debe_cambiar_contrasena: false,
      debe_aceptar_terminos: false,
    });
    expect(res.body.departamento.nombre).toBe('Coordinación');
  });

  it('las categorías derivan las prioridades del plazo alta', async () => {
    await sembrarDesarrollo(CLAVE);
    const [c] = await dataSource.query(
      `SELECT plazo_respuesta, plazo_resolucion FROM categoria WHERE nombre = 'Hardware y equipos'`,
    );
    expect(c.plazo_respuesta).toEqual({ valor: 4, unidad: 'horas' });
    expect(c.plazo_resolucion).toEqual({
      urgente: { valor: 2, unidad: 'dias' },
      alta: { valor: 3, unidad: 'dias' },
      media: { valor: 6, unidad: 'dias' },
      baja: { valor: 9, unidad: 'dias' },
    });
  });

  it('rechaza una contraseña ausente o que incumple la política', async () => {
    await expect(sembrarDesarrollo(undefined)).rejects.toThrow(ErrorSemilla);
    await expect(sembrarDesarrollo('corta')).rejects.toThrow('SEMILLA_PASSWORD');
  });
});
