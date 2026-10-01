import { describe, expect, it } from 'vitest';
import { CONTRASENA_PRUEBA, crearUsuario, ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { dataSourceOwner } from '../../database/data-source-owner.js';

const app = () => crearApp({ comprobarBd: async () => true });

describe('GET /api/auditoria', () => {
  it('config.editar lista paginado por fecha descendente con la persona y el detalle', async () => {
    const a = app();
    const admin = await crearUsuario({ rol: 'admin', nombre: 'Admin Uno' });
    const { agente } = await ingresarComo(a, admin, CONTRASENA_PRUEBA);
    const otro = await crearUsuario({ nombre: 'Otra Persona' });
    await ingresarComo(a, otro, CONTRASENA_PRUEBA);

    const res = await agente.get('/api/auditoria');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 2, pagina: 1, por_pagina: 50 });
    expect(res.body.datos).toHaveLength(2);
    const [nuevo, viejo] = res.body.datos;
    expect(nuevo.accion).toBe('ingreso_ok');
    expect(nuevo.usuario).toEqual({ id: otro.id, nombre: 'Otra Persona' });
    expect(nuevo.detalle.correo).toBe(otro.correo);
    expect(nuevo.ip).toBeTruthy();
    expect(nuevo.req_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(viejo.usuario.id).toBe(admin.id);
    expect(typeof nuevo.id).toBe('number');
    expect(new Date(nuevo.creado_en).getTime()).toBeGreaterThanOrEqual(
      new Date(viejo.creado_en).getTime(),
    );

    const pagina = await agente.get('/api/auditoria?por_pagina=1&pagina=2');
    expect(pagina.body.datos).toHaveLength(1);
    expect(pagina.body.datos[0].id).toBe(viejo.id);
    expect(pagina.body.total).toBe(2);
  });

  it('filtra por acción, persona, correo (en detalle) y rango de fechas', async () => {
    const a = app();
    const { agente } = await ingresarComo(a, await crearUsuario({ rol: 'admin' }));
    const u = await crearUsuario();
    await agente.get('/api/yo'); // sin auditoría
    await dataSourceOwner.initialize();
    try {
      await dataSourceOwner.query(
        `INSERT INTO auditoria (accion, detalle, creado_en) VALUES
           ('ingreso_fallido', '{"correo":"fallido@zydesk.test"}', now() - interval '3 days'),
           ('ingreso_fallido', '{"correo":"fallido@zydesk.test"}', now() - interval '1 day'),
           ('cuenta_bloqueada', '{"correo":"otro@zydesk.test"}', now() - interval '1 day')`,
      );
      await dataSourceOwner.query(
        `UPDATE auditoria SET usuario_id = $1 WHERE accion = 'cuenta_bloqueada'`,
        [u.id],
      );
    } finally {
      await dataSourceOwner.destroy();
    }

    const porAccion = await agente.get('/api/auditoria?accion=ingreso_fallido');
    expect(porAccion.body.total).toBe(2);
    const porCorreo = await agente.get('/api/auditoria?correo=FALLIDO@zydesk.test');
    expect(porCorreo.body.total).toBe(2);
    const porPersona = await agente.get(`/api/auditoria?usuario_id=${u.id}`);
    expect(porPersona.body.total).toBe(1);
    expect(porPersona.body.datos[0].accion).toBe('cuenta_bloqueada');
    const desde = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const porFecha = await agente.get(
      `/api/auditoria?accion=ingreso_fallido&desde=${encodeURIComponent(desde)}`,
    );
    expect(porFecha.body.total).toBe(1);
    const hasta = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const hastaRes = await agente.get(
      `/api/auditoria?accion=ingreso_fallido&hasta=${encodeURIComponent(hasta)}`,
    );
    expect(hastaRes.body.total).toBe(1);
    expect((await agente.get('/api/auditoria?accion=inventada')).status).toBe(400);
  });

  it('no hay escritura por API y otros roles reciben 403', async () => {
    const a = app();
    const { agente } = await ingresarComo(
      a,
      await crearUsuario({ rol: 'coordinacion' }),
      CONTRASENA_PRUEBA,
    );
    expect((await agente.get('/api/auditoria')).status).toBe(403);
    expect((await agente.post('/api/auditoria').send({})).status).toBe(404);
    const [{ n }] = await dataSource.query(`SELECT count(*)::int AS n FROM auditoria`);
    expect(n).toBe(1);
  });
});
