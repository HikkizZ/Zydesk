import { describe, expect, it } from 'vitest';
import { crearCategoria, crearUsuario, ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function sesion(rol: 'admin' | 'tecnico' | 'lectura') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const cuerpo = (nombre = 'Hardware', responsable: number | null = null) => ({
  nombre,
  responsable_defecto_id: responsable,
  plazo_respuesta: { valor: 2, unidad: 'horas' },
  plazo_resolucion: {
    urgente: { valor: 4, unidad: 'horas' },
    alta: { valor: 1, unidad: 'dias' },
    media: { valor: 3, unidad: 'dias' },
    baja: { valor: 5, unidad: 'dias' },
  },
});

const auditoria = () =>
  dataSource.query(
    `SELECT usuario_id, detalle FROM auditoria WHERE accion = 'config_cambiada' ORDER BY id`,
  );

describe('categorías', () => {
  it('crea con responsable, devuelve el nombre del responsable y audita', async () => {
    const { agente, usuario } = await sesion('admin');
    const tecnico = await crearUsuario({ nombre: 'Ana Pérez' });
    const res = await agente.post('/api/categorias').send(cuerpo('Hardware', tecnico.id));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nombre: 'Hardware',
      activo: true,
      responsable_defecto: { id: tecnico.id, nombre: 'Ana Pérez' },
      plazo_respuesta: { valor: 2, unidad: 'horas' },
    });
    expect(res.body.plazo_resolucion.baja).toEqual({ valor: 5, unidad: 'dias' });
    expect(await auditoria()).toEqual([
      {
        usuario_id: usuario.id,
        detalle: { seccion: 'categoria', categoria_id: res.body.id, accion: 'creado' },
      },
    ]);
  });

  it('400 si el responsable no existe o está inactivo; 409 por nombre (sin distinguir mayúsculas)', async () => {
    const { agente } = await sesion('admin');
    const inactivo = await crearUsuario({ activo: false });
    expect((await agente.post('/api/categorias').send(cuerpo('A', 9999))).status).toBe(400);
    const r = await agente.post('/api/categorias').send(cuerpo('A', inactivo.id));
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('VALIDACION');

    expect((await agente.post('/api/categorias').send(cuerpo('Red'))).status).toBe(201);
    const dup = await agente.post('/api/categorias').send(cuerpo('RED'));
    expect(dup.status).toBe(409);
    const plazoMalo = { ...cuerpo('Z'), plazo_respuesta: { valor: 0, unidad: 'horas' } };
    expect((await agente.post('/api/categorias').send(plazoMalo)).status).toBe(400);
  });

  it('PUT reemplaza, 404 y 409', async () => {
    const { agente } = await sesion('admin');
    const c = await crearCategoria({ nombre: 'Vieja' });
    await crearCategoria({ nombre: 'Otra' });
    const res = await agente.put(`/api/categorias/${c.id}`).send({
      ...cuerpo('Nueva'),
      plazo_respuesta: { valor: 1, unidad: 'dias' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      nombre: 'Nueva',
      plazo_respuesta: { valor: 1, unidad: 'dias' },
    });
    expect((await agente.put('/api/categorias/9999').send(cuerpo('X'))).status).toBe(404);
    expect((await agente.put(`/api/categorias/${c.id}`).send(cuerpo('otra'))).status).toBe(409);
    const a = await auditoria();
    expect(a[0].detalle).toMatchObject({ accion: 'editado', categoria_id: c.id });
  });

  it('desactivar y reactivar; el listado filtra por activo y ordena por nombre', async () => {
    const { agente } = await sesion('admin');
    const b = await crearCategoria({ nombre: 'B' });
    await crearCategoria({ nombre: 'A' });

    const off = await agente.post(`/api/categorias/${b.id}/desactivar`);
    expect(off.status).toBe(200);
    expect(off.body.activo).toBe(false);

    const todas = await agente.get('/api/categorias');
    expect(todas.body.map((c: { nombre: string }) => c.nombre)).toEqual(['A', 'B']);
    const activas = await agente.get('/api/categorias?activo=true');
    expect(activas.body.map((c: { nombre: string }) => c.nombre)).toEqual(['A']);
    const inactivas = await agente.get('/api/categorias?activo=false');
    expect(inactivas.body.map((c: { nombre: string }) => c.nombre)).toEqual(['B']);

    const on = await agente.post(`/api/categorias/${b.id}/reactivar`);
    expect(on.body.activo).toBe(true);
    expect((await agente.post('/api/categorias/9999/desactivar')).status).toBe(404);
    const acciones = (await auditoria()).map(
      (f: { detalle: { accion: string } }) => f.detalle.accion,
    );
    expect(acciones).toEqual(['desactivado', 'reactivado']);
  });

  it('técnico y lectura leen pero no escriben', async () => {
    const c = await crearCategoria();
    for (const rol of ['tecnico', 'lectura'] as const) {
      const { agente } = await sesion(rol);
      expect((await agente.get('/api/categorias')).status).toBe(200);
      expect((await agente.post('/api/categorias').send(cuerpo('X'))).status).toBe(403);
      expect((await agente.put(`/api/categorias/${c.id}`).send(cuerpo('X'))).status).toBe(403);
      expect((await agente.post(`/api/categorias/${c.id}/desactivar`)).status).toBe(403);
    }
  });
});
