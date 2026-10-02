import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  crearAviso,
  crearOt,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { dataSource } from '../../config/db.js';
import { crearApp } from '../../app.js';

const appMiDia = () => crearApp({ comprobarBd: async () => true });

// Prueba 15 de la spec fase 6 §14.

describe('prueba 15: Mi día', () => {
  it('sin sesión → 401', async () => {
    const r = await request(appMiDia()).get('/api/mi-dia');
    expect(r.status).toBe(401);
  });

  it('solo muestra lo de la persona: un seguidor no ve el ticket y lo ajeno no aparece', async () => {
    const tecnico = await crearUsuario();
    const otro = await crearUsuario();
    const { agente } = await ingresarComo(appMiDia(), tecnico);
    const t = await crearTicket({ principal_id: otro.id, fecha_limite: new Date() });
    await crearTicket({ principal_id: otro.id, fecha_limite: new Date(Date.now() - 86_400_000) });
    await crearTarea(t.id, { responsable_id: otro.id });
    await crearAviso(otro.id);
    await dataSource.query(`INSERT INTO ticket_seguidor (ticket_id, usuario_id) VALUES ($1, $2)`, [
      t.id,
      tecnico.id,
    ]);

    const r = await agente.get('/api/mi-dia');
    expect(r.status).toBe(200);
    expect(r.body.conteos).toEqual({
      vencen_hoy: 0,
      vencidos: 0,
      por_aprobar: 0,
      menciones: 0,
      tareas: 0,
      detenidos: 0,
    });
  });

  it('por_aprobar vacío sin ots.aprobar aunque sea aprobador_id', async () => {
    const tecnico = await crearUsuario({ rol: 'tecnico' });
    const lectura = await crearUsuario({ rol: 'lectura' });
    const t = await crearTicket();
    await crearOt(t.id, { tipo: 'interna', etapa: 'borrador', aprobador_id: tecnico.id });
    await crearOt(t.id, { tipo: 'interna', etapa: 'borrador', aprobador_id: lectura.id });
    for (const u of [tecnico, lectura]) {
      const { agente } = await ingresarComo(appMiDia(), u);
      const r = await agente.get('/api/mi-dia');
      expect(r.status).toBe(200);
      expect(r.body.por_aprobar).toEqual([]);
    }
  });

  it('ignora un usuario_id en la query: siempre es la persona de la sesión', async () => {
    const tecnico = await crearUsuario();
    const otro = await crearUsuario();
    await crearTicket({ principal_id: otro.id, fecha_limite: new Date() });
    const { agente } = await ingresarComo(appMiDia(), tecnico);
    const r = await agente.get(`/api/mi-dia?usuario_id=${otro.id}`);
    expect(r.status).toBe(200);
    expect(r.body.conteos.vencen_hoy).toBe(0);
  });
});
