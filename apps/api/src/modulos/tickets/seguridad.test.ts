import { describe, expect, it } from 'vitest';
import { crearTicket, crearUsuario, ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });

const entrada = {
  asunto: 'Intento de lectura',
  descripcion: null,
  cliente_id: null,
  solicitante_nombre: null,
  solicitante_correo: null,
  origen: 'externo',
  prioridad: 'media',
  categoria_id: null,
  inicio_planificado: null,
  fecha_limite: null,
  horas_estimadas: null,
};

describe('seguridad de tickets (§14)', () => {
  it('prueba 1: lectura no puede escribir en ningún endpoint y no deja rastro; sí puede leer', async () => {
    const lector = await crearUsuario({ rol: 'lectura' });
    const { agente } = await ingresarComo(app(), lector);
    const t = await crearTicket();
    const intentos = [
      () => agente.post('/api/tickets').send(entrada),
      () => agente.patch(`/api/tickets/${t.id}`).send({ asunto: 'x' }),
      () => agente.post(`/api/tickets/${t.id}/cambiar-estado`).send({ estado: 'en_curso' }),
      () =>
        agente
          .put(`/api/tickets/${t.id}/responsables`)
          .send({ principal_id: lector.id, otros_ids: [] }),
      () => agente.put(`/api/tickets/${t.id}/seguidores`).send({ usuario_ids: [lector.id] }),
    ];
    for (const intento of intentos) {
      const r = await intento();
      expect(r.status).toBe(403);
      expect(r.body.error.codigo).toBe('SIN_PERMISO');
    }
    const [{ n }] = await dataSource.query(`SELECT count(*)::int AS n FROM ticket`);
    expect(n).toBe(1);
    expect(await dataSource.query(`SELECT 1 FROM evento`)).toEqual([]);
    const [f] = await dataSource.query(`SELECT asunto, estado FROM ticket WHERE id = $1`, [t.id]);
    expect(f).toEqual({ asunto: t.asunto, estado: 'nuevo' });
    for (const url of ['/api/tickets', '/api/tickets/tablero', `/api/tickets/${t.id}`]) {
      expect((await agente.get(url)).status, url).toBe(200);
    }
  });

  it('sin sesión → 401 en lectura y escritura', async () => {
    const { default: request } = await import('supertest');
    const a = app();
    expect((await request(a).get('/api/tickets')).status).toBe(401);
    const r = await request(a).post('/api/tickets').set('X-Requested-With', 'Zydesk').send(entrada);
    expect(r.status).toBe(401);
  });

  it('el id debe ser numérico positivo y el cuerpo estricto en forma (400)', async () => {
    const tecnico = await crearUsuario({ rol: 'tecnico' });
    const { agente } = await ingresarComo(app(), tecnico);
    for (const id of ['0', '-1', 'abc', '1.5']) {
      expect((await agente.get(`/api/tickets/${id}`)).status, id).toBe(400);
    }
    expect((await agente.post('/api/tickets').send({ asunto: 'sin origen' })).status).toBe(400);
    expect(
      (await agente.post('/api/tickets').send({ ...entrada, prioridad: 'critica' })).status,
    ).toBe(400);
  });

  it('prueba 16: X-Request-Id presente en 409 y coincide con evento.req_id del cambio de estado', async () => {
    const tecnico = await crearUsuario({ rol: 'tecnico' });
    const { agente } = await ingresarComo(app(), tecnico);
    const t = await crearTicket({ estado: 'en_curso' });
    const ok = await agente
      .post(`/api/tickets/${t.id}/cambiar-estado`)
      .send({ estado: 'resuelto' });
    expect(ok.status).toBe(200);
    const [ev] = await dataSource.query(`SELECT req_id FROM evento WHERE entidad = 'ticket'`);
    expect(ev.req_id).toBe(ok.headers['x-request-id']);
    const conflicto = await agente
      .post(`/api/tickets/${t.id}/cambiar-estado`)
      .send({ estado: 'descartado', motivo: 'x' });
    expect(conflicto.status).toBe(409);
    expect(conflicto.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
