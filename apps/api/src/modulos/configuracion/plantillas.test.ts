import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearPlantilla, crearUsuario, ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });
const BASE = '/api/config/plantillas-cotizacion';

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const entrada = (extra: object = {}) => ({
  nombre: 'Visita técnica',
  descripcion: 'Visita en terreno',
  condiciones: 'Pago a 30 días',
  lineas: [
    { tipo: 'mano_de_obra', descripcion: 'Horas', cantidad: 2, unidad: 'h', precio_unitario: null },
    {
      tipo: 'material',
      descripcion: 'Cable',
      cantidad: 3.5,
      unidad: 'un',
      precio_unitario: 1500.5,
      descuento_pct: 10,
    },
  ],
  ...extra,
});

const ultimaAuditoria = async () =>
  (
    await dataSource.query(
      `SELECT detalle FROM auditoria WHERE accion = 'config_cambiada' ORDER BY id DESC LIMIT 1`,
    )
  )[0].detalle;

describe('plantillas de cotización', () => {
  it('sin sesión → 401', async () => {
    expect((await request(app()).get(BASE)).status).toBe(401);
    const r = await request(app()).post(BASE).set('X-Requested-With', 'Zydesk').send(entrada());
    expect(r.status).toBe(401);
  });

  it('roles: todos leen; técnico, coordinación y lectura → 403 en toda mutación', async () => {
    const p = await crearPlantilla();
    for (const rol of ['admin', 'coordinacion', 'tecnico', 'lectura'] as const) {
      const { agente } = await como(rol);
      expect((await agente.get(BASE)).status, rol).toBe(200);
    }
    for (const rol of ['coordinacion', 'tecnico', 'lectura'] as const) {
      const { agente } = await como(rol);
      expect((await agente.post(BASE).send(entrada())).status, rol).toBe(403);
      expect((await agente.put(`${BASE}/${p.id}`).send(entrada())).status, rol).toBe(403);
      const d = await agente.patch(`${BASE}/${p.id}/activo`).send({ activo: false });
      expect(d.status, rol).toBe(403);
    }
  });

  it('crear: 201, líneas ordenadas, precio null y defectos; auditoría sin evento', async () => {
    const { agente } = await como('admin');
    const r = await agente.post(BASE).send(entrada());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      nombre: 'Visita técnica',
      activo: true,
      lineas: [
        {
          orden: 1,
          descripcion: 'Horas',
          cantidad: 2,
          unidad: 'h',
          precio_unitario: null,
          descuento_pct: 0,
        },
        {
          orden: 2,
          descripcion: 'Cable',
          cantidad: 3.5,
          precio_unitario: 1500.5,
          descuento_pct: 10,
        },
      ],
    });
    expect(await ultimaAuditoria()).toEqual({
      seccion: 'plantillas',
      plantilla_id: r.body.id,
      accion: 'creada',
    });
    const [{ n }] = await dataSource.query(`SELECT count(*)::int AS n FROM evento`);
    expect(n).toBe(0);
  });

  it('nombre único sin distinguir mayúsculas → 409 CONFLICTO { nombre }; no deja filas a medias', async () => {
    const { agente } = await como('admin');
    await agente.post(BASE).send(entrada({ nombre: 'Visita' }));
    const r = await agente.post(BASE).send(entrada({ nombre: 'VISITA' }));
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('CONFLICTO');
    expect(r.body.error.detalles).toHaveProperty('nombre');
    const [{ n }] = await dataSource.query(`SELECT count(*)::int AS n FROM plantilla_cotizacion`);
    expect(n).toBe(1);
    const [{ l }] = await dataSource.query(`SELECT count(*)::int AS l FROM plantilla_linea`);
    expect(l).toBe(2);
  });

  it('editar reemplaza las líneas; nombre de otra → 409; inexistente → 404', async () => {
    const { agente } = await como('admin');
    const a = (await agente.post(BASE).send(entrada())).body;
    await agente.post(BASE).send(entrada({ nombre: 'Otra' }));
    const r = await agente
      .put(`${BASE}/${a.id}`)
      .send(
        entrada({ lineas: [{ tipo: 'traslado', descripcion: 'Km', cantidad: 10, unidad: 'km' }] }),
      );
    expect(r.status).toBe(200);
    expect(r.body.lineas).toHaveLength(1);
    expect(r.body.lineas[0]).toMatchObject({ orden: 1, tipo: 'traslado', precio_unitario: null });
    expect(await ultimaAuditoria()).toEqual({
      seccion: 'plantillas',
      plantilla_id: a.id,
      accion: 'editada',
    });
    expect((await agente.put(`${BASE}/${a.id}`).send(entrada({ nombre: 'otra' }))).status).toBe(
      409,
    );
    expect((await agente.put(`${BASE}/99999`).send(entrada())).status).toBe(404);
  });

  it('valida: más de 50 líneas, cantidad 0, nombre vacío y tipo inválido → 400', async () => {
    const { agente } = await como('admin');
    const linea = { tipo: 'servicio', descripcion: 'x', cantidad: 1, unidad: 'gl' };
    const casos = [
      { lineas: Array.from({ length: 51 }, () => linea) },
      { lineas: [{ ...linea, cantidad: 0 }] },
      { nombre: ' ' },
      { lineas: [{ ...linea, tipo: 'otro' }] },
    ];
    for (const [i, malo] of casos.entries()) {
      const r = await agente.post(BASE).send(entrada(malo));
      expect(r.status, `caso ${i}`).toBe(400);
    }
  });

  it('listar: sin `activo` solo activas por nombre; activo=false las inactivas', async () => {
    const { agente } = await como('lectura');
    await crearPlantilla({ nombre: 'Beta', lineas: [{ cantidad: 1 }] });
    const alfa = await crearPlantilla({ nombre: 'Alfa' });
    const inactiva = await crearPlantilla({ nombre: 'Gamma' });
    await dataSource.query(`UPDATE plantilla_cotizacion SET activo = false WHERE id = $1`, [
      inactiva.id,
    ]);
    const r = await agente.get(BASE);
    expect(r.body.map((p: { nombre: string }) => p.nombre)).toEqual(['Alfa', 'Beta']);
    expect(r.body[0].id).toBe(alfa.id);
    expect(r.body[1].lineas).toHaveLength(1);
    const i = await agente.get(`${BASE}?activo=false`);
    expect(i.body.map((p: { nombre: string }) => p.nombre)).toEqual(['Gamma']);
  });

  it('PATCH activo: desactiva y reactiva con auditoría; sin cambio no audita; inexistente → 404', async () => {
    const { agente } = await como('admin');
    const p = await crearPlantilla();
    const d = await agente.patch(`${BASE}/${p.id}/activo`).send({ activo: false });
    expect(d.status).toBe(200);
    expect(d.body.activo).toBe(false);
    expect(await ultimaAuditoria()).toEqual({
      seccion: 'plantillas',
      plantilla_id: p.id,
      accion: 'desactivada',
    });
    await agente.patch(`${BASE}/${p.id}/activo`).send({ activo: false });
    const [{ n }] = await dataSource.query(
      `SELECT count(*)::int AS n FROM auditoria WHERE accion = 'config_cambiada'`,
    );
    expect(n).toBe(1);
    const a = await agente.patch(`${BASE}/${p.id}/activo`).send({ activo: true });
    expect(a.body.activo).toBe(true);
    expect(await ultimaAuditoria()).toEqual({
      seccion: 'plantillas',
      plantilla_id: p.id,
      accion: 'activada',
    });
    expect((await agente.patch(`${BASE}/99999/activo`).send({ activo: true })).status).toBe(404);
  });
});
