import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  CONTRASENA_PRUEBA,
  crearDepartamento,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { COLORES_AVATAR } from './usuarios.service.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function adminConSesion(a = app()) {
  const admin = await crearUsuario({ rol: 'admin', nombre: 'Admin Uno' });
  return { a, admin, ...(await ingresarComo(a, admin)) };
}

const auditoria = (accion: string) =>
  dataSource.query(`SELECT usuario_id, detalle FROM auditoria WHERE accion = $1 ORDER BY id`, [
    accion,
  ]);

describe('GET /api/usuarios', () => {
  it('cualquier rol lista por nombre y filtra por activo, rol y q', async () => {
    const a = app();
    const depto = await crearDepartamento({ nombre: 'Soporte TI' });
    await crearUsuario({ nombre: 'Zoe Ruiz', rol: 'lectura' });
    await crearUsuario({ nombre: 'Ana Pérez', rol: 'tecnico', departamento_id: depto.id });
    await crearUsuario({ nombre: 'Beto Soto', rol: 'tecnico', activo: false });
    const { agente } = await ingresarComo(
      a,
      await crearUsuario({ nombre: 'Caro', rol: 'tecnico' }),
    );

    const todos = await agente.get('/api/usuarios');
    expect(todos.status).toBe(200);
    expect(todos.body.map((u: { nombre: string }) => u.nombre)).toEqual([
      'Ana Pérez',
      'Beto Soto',
      'Caro',
      'Zoe Ruiz',
    ]);
    expect(todos.body[0]).toMatchObject({
      iniciales: 'AP',
      departamento: { id: depto.id, nombre: 'Soporte TI' },
    });
    expect(todos.body[0]).not.toHaveProperty('contrasena_hash');

    const activos = await agente.get('/api/usuarios?activo=true');
    expect(activos.body).toHaveLength(3);
    const inactivos = await agente.get('/api/usuarios?activo=false');
    expect(inactivos.body.map((u: { nombre: string }) => u.nombre)).toEqual(['Beto Soto']);
    const lectura = await agente.get('/api/usuarios?rol=lectura');
    expect(lectura.body).toHaveLength(1);
    const q = await agente.get('/api/usuarios?q=p%C3%A9rez');
    expect(q.body.map((u: { nombre: string }) => u.nombre)).toEqual(['Ana Pérez']);
  });

  it('GET /api/usuarios/:id devuelve el usuario o 404', async () => {
    const { agente, admin } = await adminConSesion();
    const ok = await agente.get(`/api/usuarios/${admin.id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(admin.id);
    expect((await agente.get('/api/usuarios/9999')).status).toBe(404);
    expect((await agente.get('/api/usuarios/abc')).status).toBe(400);
  });
});

describe('POST /api/usuarios', () => {
  const datos = (correo: string) => ({
    nombre: 'Nueva Persona',
    correo,
    rol: 'tecnico',
    departamento_id: null,
    contrasena_temporal: 'Temporal.Clave.9',
  });

  it('crea con debe_cambiar_contrasena, color por rotación y auditoría; la persona puede ingresar', async () => {
    const { a, admin, agente } = await adminConSesion();
    const res = await agente.post('/api/usuarios').send(datos('Nueva@Zydesk.test'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nombre: 'Nueva Persona',
      correo: 'nueva@zydesk.test',
      rol: 'tecnico',
      activo: true,
      debe_cambiar_contrasena: true,
      iniciales: 'NP',
      color_avatar: COLORES_AVATAR[1], // ya había 1 usuario (el admin)
    });
    expect(res.body).not.toHaveProperty('contrasena_hash');
    expect(JSON.stringify(res.body)).not.toContain('Temporal.Clave.9');
    const [ev] = await auditoria('usuario_creado');
    expect(ev).toEqual({
      usuario_id: admin.id,
      detalle: { usuario_creado_id: res.body.id, rol: 'tecnico' },
    });
    expect(JSON.stringify(ev)).not.toContain('Temporal');

    const { agente: nuevo } = await ingresarComo(
      a,
      { correo: 'nueva@zydesk.test' },
      'Temporal.Clave.9',
    );
    const yo = await nuevo.get('/api/yo');
    expect(yo.body).toMatchObject({ debe_cambiar_contrasena: true, debe_aceptar_terminos: true });
  });

  it('respeta color_avatar explícito', async () => {
    const { agente } = await adminConSesion();
    const res = await agente
      .post('/api/usuarios')
      .send({ ...datos('c@zydesk.test'), color_avatar: '#123456' });
    expect(res.body.color_avatar).toBe('#123456');
  });

  it('correo duplicado (sin distinguir mayúsculas) → 409 {campo: correo}', async () => {
    const { agente } = await adminConSesion();
    await crearUsuario({ correo: 'dup@zydesk.test' });
    const res = await agente.post('/api/usuarios').send(datos('DUP@zydesk.test'));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ codigo: 'CONFLICTO', detalles: { campo: 'correo' } });
  });

  it('valida el cuerpo, la política de la temporal y el departamento', async () => {
    const { agente } = await adminConSesion();
    const corta = await agente
      .post('/api/usuarios')
      .send({ ...datos('x@zydesk.test'), contrasena_temporal: 'corta' });
    expect(corta.status).toBe(400);
    expect(corta.body.error.codigo).toBe('VALIDACION');
    const comun = await agente
      .post('/api/usuarios')
      .send({ ...datos('y@zydesk.test'), contrasena_temporal: 'password123' });
    expect(comun.status).toBe(400);
    expect(comun.body.error).toMatchObject({
      codigo: 'CONTRASENA_DEBIL',
      detalles: { motivo: 'comun' },
    });
    const sinDepto = await agente
      .post('/api/usuarios')
      .send({ ...datos('z@zydesk.test'), departamento_id: 9999 });
    expect(sinDepto.status).toBe(400);
    expect(sinDepto.body.error.codigo).toBe('VALIDACION');
  });
});

describe('PATCH /api/usuarios/:id', () => {
  it('edita datos sin cerrar sesiones; 404 y correo duplicado', async () => {
    const { a, agente } = await adminConSesion();
    const depto = await crearDepartamento();
    const u = await crearUsuario({ nombre: 'Viejo' });
    const s = await ingresarComo(a, u);
    const res = await agente
      .patch(`/api/usuarios/${u.id}`)
      .send({ nombre: 'Nuevo Nombre', departamento_id: depto.id, color_avatar: '#abcdef' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      nombre: 'Nuevo Nombre',
      departamento_id: depto.id,
      color_avatar: '#abcdef',
      iniciales: 'NN',
    });
    expect((await request(a).get('/api/yo').set('Cookie', s.cookie)).status).toBe(200);
    expect((await agente.patch('/api/usuarios/9999').send({ nombre: 'x' })).status).toBe(404);
    const otro = await crearUsuario({ correo: 'otro@zydesk.test' });
    const dup = await agente.patch(`/api/usuarios/${u.id}`).send({ correo: 'OTRO@zydesk.test' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.detalles).toEqual({ campo: 'correo' });
    // conservar el propio correo no es duplicado
    const mismo = await agente.patch(`/api/usuarios/${otro.id}`).send({ correo: otro.correo });
    expect(mismo.status).toBe(200);
  });

  it('cambiar el rol cierra sus sesiones y audita rol_cambiado y sesion_cerrada', async () => {
    const { a, admin, agente } = await adminConSesion();
    const u = await crearUsuario({ rol: 'tecnico' });
    await ingresarComo(a, u);
    const res = await agente.patch(`/api/usuarios/${u.id}`).send({ rol: 'coordinacion' });
    expect(res.status).toBe(200);
    expect(res.body.rol).toBe('coordinacion');
    expect(await auditoria('rol_cambiado')).toEqual([
      {
        usuario_id: admin.id,
        detalle: { usuario_afectado_id: u.id, de: 'tecnico', a: 'coordinacion' },
      },
    ]);
    const cerradas = await auditoria('sesion_cerrada');
    expect(cerradas).toHaveLength(1);
    expect(cerradas[0].detalle.motivo).toBe('rol');
    // enviar el mismo rol no cierra nada
    await ingresarComo(a, u);
    await agente.patch(`/api/usuarios/${u.id}`).send({ rol: 'coordinacion' });
    expect(await auditoria('rol_cambiado')).toHaveLength(1);
    expect(await auditoria('sesion_cerrada')).toHaveLength(1);
  });

  it('no quita el rol admin al último admin activo (409), pero sí habiendo otro', async () => {
    const { agente, admin } = await adminConSesion();
    const res = await agente.patch(`/api/usuarios/${admin.id}`).send({ rol: 'tecnico' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      codigo: 'CONFLICTO',
      detalles: { motivo: 'ultimo_admin' },
    });
    const otro = await crearUsuario({ rol: 'admin' });
    const ok = await agente.patch(`/api/usuarios/${otro.id}`).send({ rol: 'lectura' });
    expect(ok.status).toBe(200);
    // un admin inactivo no cuenta como admin activo
    await dataSource.query(`UPDATE usuario SET activo = false WHERE id = $1`, [otro.id]);
    await dataSource.query(`UPDATE usuario SET rol = 'admin' WHERE id = $1`, [otro.id]);
    const aun = await agente.patch(`/api/usuarios/${admin.id}`).send({ rol: 'tecnico' });
    expect(aun.status).toBe(409);
  });
});

describe('desactivar y reactivar', () => {
  it('desactivar cierra sesiones y audita; reactivar audita usuario_reactivado y permite ingresar', async () => {
    const { a, admin, agente } = await adminConSesion();
    const u = await crearUsuario();
    await ingresarComo(a, u);
    const off = await agente.post(`/api/usuarios/${u.id}/desactivar`);
    expect(off.status).toBe(200);
    expect(off.body.activo).toBe(false);
    expect(await auditoria('usuario_desactivado')).toEqual([
      { usuario_id: admin.id, detalle: { usuario_afectado_id: u.id } },
    ]);
    expect((await auditoria('sesion_cerrada'))[0].detalle.motivo).toBe('desactivado');
    const [{ n }] = await dataSource.query(
      `SELECT count(*)::int AS n FROM sesion WHERE usuario_id = $1`,
      [u.id],
    );
    expect(n).toBe(0);

    const on = await agente.post(`/api/usuarios/${u.id}/reactivar`);
    expect(on.status).toBe(200);
    expect(on.body.activo).toBe(true);
    expect(await auditoria('usuario_reactivado')).toHaveLength(1);
    expect((await ingresarComo(a, u)).cookie).toBeTruthy();
  });

  it('no permite desactivarse a sí mismo (409), pero sí a otro admin', async () => {
    const { agente, admin } = await adminConSesion();
    const propio = await agente.post(`/api/usuarios/${admin.id}/desactivar`);
    expect(propio.status).toBe(409);
    expect(propio.body.error.detalles).toEqual({ motivo: 'propio' });
    const otro = await crearUsuario({ rol: 'admin' });
    const ok = await agente.post(`/api/usuarios/${otro.id}/desactivar`);
    expect(ok.status).toBe(200);
  });

  it('404 para usuarios inexistentes', async () => {
    const { agente } = await adminConSesion();
    expect((await agente.post('/api/usuarios/9999/desactivar')).status).toBe(404);
    expect((await agente.post('/api/usuarios/9999/reactivar')).status).toBe(404);
    expect((await agente.post('/api/usuarios/9999/restablecer-contrasena')).status).toBe(404);
  });
});

describe('POST /api/usuarios/:id/restablecer-contrasena', () => {
  it('devuelve una temporal válida una sola vez, fuerza el cambio, cierra sesiones y nunca audita la clave', async () => {
    const { a, admin, agente } = await adminConSesion();
    const u = await crearUsuario();
    const vieja = await ingresarComo(a, u);
    const res = await agente.post(`/api/usuarios/${u.id}/restablecer-contrasena`);
    expect(res.status).toBe(200);
    const temporal = res.body.contrasena_temporal as string;
    expect(temporal).toMatch(/^[A-Za-z2-9]{14}$/);
    expect((await request(a).get('/api/yo').set('Cookie', vieja.cookie)).status).toBe(401);
    expect(await auditoria('contrasena_restablecida')).toEqual([
      { usuario_id: admin.id, detalle: { usuario_afectado_id: u.id } },
    ]);
    const todo = JSON.stringify(await dataSource.query(`SELECT * FROM auditoria`));
    expect(todo).not.toContain(temporal);
    const nueva = await ingresarComo(a, u, temporal);
    expect((await nueva.agente.get('/api/yo')).body.debe_cambiar_contrasena).toBe(true);
    const anterior = await request(a)
      .post('/api/auth/ingresar')
      .set('X-Requested-With', 'Zydesk')
      .send({ correo: u.correo, contrasena: CONTRASENA_PRUEBA });
    expect(anterior.status).toBe(401);
  });
});
