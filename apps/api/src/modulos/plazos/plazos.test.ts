import { TZDate } from '@date-fns/tz';
import { ZONA } from '@zydesk/shared';
import { describe, expect, it } from 'vitest';
import { crearDepartamento, crearUsuario, ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });
const local = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(new TZDate(y, m - 1, d, h, min, ZONA).getTime()).toISOString();

async function agente() {
  return (await ingresarComo(app(), await crearUsuario({ rol: 'lectura' }))).agente;
}

describe('POST /api/plazos/calcular', () => {
  it('caso 5: jue 17-sep 17:00 + 2 h con feriados 18 y 19-sep → lun 21-sep 09:30', async () => {
    const depto = await crearDepartamento({ nombre: 'Soporte TI' });
    const a = await agente();
    const res = await a.post('/api/plazos/calcular').send({
      desde: local(2026, 9, 17, 17),
      plazo: { valor: 2, unidad: 'horas' },
      departamento_id: depto.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.hasta).toBe(local(2026, 9, 21, 9, 30));
    expect(res.body.horas_habiles).toBe(2);
  });

  it('plazo en días y feriado propio del departamento', async () => {
    const depto = await crearDepartamento();
    await dataSource.query(
      `INSERT INTO feriado (fecha, nombre, departamento_id) VALUES ($1, 'Propio', $2)`,
      ['2026-09-30', depto.id],
    );
    const a = await agente();
    const res = await a.post('/api/plazos/calcular').send({
      desde: local(2026, 9, 29, 10),
      plazo: { valor: 1, unidad: 'dias' },
      departamento_id: depto.id,
    });
    expect(res.status).toBe(200);
    // mié 30 es feriado del departamento: salta a jue 1-oct a la misma hora
    expect(res.body.hasta).toBe(local(2026, 10, 1, 10));
  });

  it('cruza fin de año usando los feriados del año siguiente', async () => {
    const depto = await crearDepartamento();
    const a = await agente();
    const res = await a.post('/api/plazos/calcular').send({
      desde: local(2026, 12, 30, 9),
      plazo: { valor: 3, unidad: 'dias' },
      departamento_id: depto.id,
    });
    // jue 31, (vie 1-ene-2027 feriado), lun 4, mar 5
    expect(res.body.hasta).toBe(local(2027, 1, 5, 9));
  });

  it('404 si el departamento no existe; 400 si el cuerpo es inválido; 401 sin sesión', async () => {
    const a = await agente();
    const body = { desde: local(2026, 9, 17, 17), plazo: { valor: 2, unidad: 'horas' } };
    const r404 = await a.post('/api/plazos/calcular').send({ ...body, departamento_id: 9999 });
    expect(r404.status).toBe(404);
    const r400 = await a.post('/api/plazos/calcular').send({ ...body, departamento_id: 'x' });
    expect(r400.status).toBe(400);
    const r401 = await (
      await import('supertest')
    )
      .default(app())
      .post('/api/plazos/calcular')
      .set('X-Requested-With', 'Zydesk')
      .send({ ...body, departamento_id: 1 });
    expect(r401.status).toBe(401);
  });
});
