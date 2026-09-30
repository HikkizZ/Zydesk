import { describe, expect, it } from 'vitest';
import { crearDepartamento, crearUsuario, ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function sesion(rol: 'admin' | 'tecnico' | 'lectura', a = app()) {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(a, usuario)) };
}

// L-J 08:00-17:00 colación 13:00/60, V 08:00-16:00, S y D libres (0 = domingo)
const horario = (viernesSalida = '16:00') =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const laboral = d >= 1 && d <= 5;
    return {
      dia_semana: d,
      activo: laboral,
      entrada: laboral ? '08:00' : '09:00',
      salida: d === 5 ? viernesSalida : laboral ? '17:00' : '13:00',
      colacion_inicio: '13:00',
      colacion_min: laboral ? 60 : 0,
    };
  });

const entrada = (nombre = 'Terreno', viernesSalida?: string) => ({
  nombre,
  hora_extendida_desde: '19:00',
  capacidad_tickets_pct: 70,
  horario: horario(viernesSalida),
});

const auditoria = (accion = 'config_cambiada') =>
  dataSource.query(`SELECT usuario_id, detalle FROM auditoria WHERE accion = $1 ORDER BY id`, [
    accion,
  ]);

describe('departamentos', () => {
  it('crea, lista con jornada y personas, obtiene y audita', async () => {
    const { agente, usuario } = await sesion('admin');
    const res = await agente.post('/api/departamentos').send(entrada());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nombre: 'Terreno',
      jornada_semanal_horas: 39,
      personas: 0,
      capacidad_tickets_pct: 70,
    });
    expect(res.body.horario).toHaveLength(7);
    expect(res.body.horario[0]).toMatchObject({ dia_semana: 0, activo: false });

    await crearUsuario({ departamento_id: res.body.id });
    await crearUsuario({ departamento_id: res.body.id, activo: false });
    await crearDepartamento({ nombre: 'Abastecimiento' });

    const { agente: lector } = await sesion('lectura');
    const lista = await lector.get('/api/departamentos');
    expect(lista.status).toBe(200);
    expect(lista.body.map((d: { nombre: string }) => d.nombre)).toEqual([
      'Abastecimiento',
      'Terreno',
    ]);
    expect(lista.body[1].personas).toBe(1);

    const uno = await lector.get(`/api/departamentos/${res.body.id}`);
    expect(uno.status).toBe(200);
    expect(uno.body.id).toBe(res.body.id);
    expect((await lector.get('/api/departamentos/9999')).status).toBe(404);

    const a = await auditoria();
    expect(a).toEqual([
      {
        usuario_id: usuario.id,
        detalle: { seccion: 'departamento', departamento_id: res.body.id, accion: 'creado' },
      },
    ]);
  });

  it('409 por nombre duplicado y 400 por horario inválido', async () => {
    const { agente } = await sesion('admin');
    expect((await agente.post('/api/departamentos').send(entrada())).status).toBe(201);
    const dup = await agente.post('/api/departamentos').send(entrada());
    expect(dup.status).toBe(409);
    expect(dup.body.error.codigo).toBe('CONFLICTO');

    const malo = entrada('Otro');
    malo.horario[1]!.colacion_inicio = '17:30';
    expect((await agente.post('/api/departamentos').send(malo)).status).toBe(400);
  });

  it('PUT reemplaza los 7 horarios y audita; 404 y 409', async () => {
    const { agente, usuario } = await sesion('admin');
    const creado = await agente.post('/api/departamentos').send(entrada());
    const otro = await agente.post('/api/departamentos').send(entrada('Soporte'));

    const res = await agente
      .put(`/api/departamentos/${creado.body.id}`)
      .send(entrada('Terreno Norte', '17:00'));
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Terreno Norte');
    expect(res.body.jornada_semanal_horas).toBe(40);
    const [{ n }] = await dataSource.query(
      `SELECT count(*)::int AS n FROM horario_dia WHERE departamento_id = $1`,
      [creado.body.id],
    );
    expect(n).toBe(7);

    expect((await agente.put('/api/departamentos/9999').send(entrada('X'))).status).toBe(404);
    const conflicto = await agente
      .put(`/api/departamentos/${otro.body.id}`)
      .send(entrada('Terreno Norte'));
    expect(conflicto.status).toBe(409);

    const a = await auditoria();
    expect(a.map((f: { detalle: { accion: string } }) => f.detalle.accion)).toEqual([
      'creado',
      'creado',
      'editado',
    ]);
    expect(a[2].usuario_id).toBe(usuario.id);
  });

  it('DELETE: 409 con_personas (activas o no), 204 sin personas, 404', async () => {
    const { agente } = await sesion('admin');
    const conGente = await crearDepartamento({ nombre: 'Con gente' });
    await crearUsuario({ departamento_id: conGente.id, activo: false });
    const vacio = await crearDepartamento({ nombre: 'Vacío' });

    const r409 = await agente.delete(`/api/departamentos/${conGente.id}`);
    expect(r409.status).toBe(409);
    expect(r409.body.error.detalles).toEqual({ motivo: 'con_personas' });

    expect((await agente.delete(`/api/departamentos/${vacio.id}`)).status).toBe(204);
    expect((await agente.delete(`/api/departamentos/${vacio.id}`)).status).toBe(404);
    const horarios = await dataSource.query(
      `SELECT 1 FROM horario_dia WHERE departamento_id = $1`,
      [vacio.id],
    );
    expect(horarios).toHaveLength(0);
    const a = await auditoria();
    expect(a.at(-1).detalle).toMatchObject({ seccion: 'departamento', accion: 'eliminado' });
  });

  it('técnico: lee pero no escribe (403)', async () => {
    const { agente } = await sesion('tecnico');
    const d = await crearDepartamento();
    expect((await agente.get('/api/departamentos')).status).toBe(200);
    expect((await agente.put(`/api/departamentos/${d.id}`).send(entrada())).status).toBe(403);
    expect((await agente.delete(`/api/departamentos/${d.id}`)).status).toBe(403);
  });
});

describe('feriados', () => {
  it('lista por año (por defecto el actual), por departamento y ordenado por fecha', async () => {
    const { agente } = await sesion('admin');
    const d1 = await crearDepartamento({ nombre: 'Uno' });
    const d2 = await crearDepartamento({ nombre: 'Dos' });
    await agente
      .post('/api/feriados')
      .send({ fecha: '2026-11-20', nombre: 'Aniversario Uno', departamento_id: d1.id });
    await agente
      .post('/api/feriados')
      .send({ fecha: '2026-11-21', nombre: 'Aniversario Dos', departamento_id: d2.id });

    const anio2026 = await agente.get('/api/feriados?anio=2026');
    expect(anio2026.body).toHaveLength(18); // 16 generales + 2 de departamento
    const fechas = anio2026.body.map((f: { fecha: string }) => f.fecha);
    expect(fechas).toEqual([...fechas].sort());
    expect(anio2026.body[0]).toMatchObject({
      fecha: '2026-01-01',
      nombre: 'Año Nuevo',
      departamento_id: null,
    });

    const de1 = await agente.get(`/api/feriados?anio=2026&departamento_id=${d1.id}`);
    expect(de1.body).toHaveLength(17);
    expect(de1.body.some((f: { nombre: string }) => f.nombre === 'Aniversario Dos')).toBe(false);

    const anio2027 = await agente.get('/api/feriados?anio=2027');
    expect(anio2027.body).toHaveLength(17);

    const actual = await agente.get('/api/feriados');
    expect(actual.status).toBe(200);
    const anioHoy = new Date().getFullYear();
    expect(actual.body.every((f: { fecha: string }) => f.fecha.startsWith(String(anioHoy)))).toBe(
      true,
    );
  });

  it('crea (201), 409 duplicado por (fecha, departamento), 400 si el departamento no existe, y elimina', async () => {
    const { agente, usuario } = await sesion('admin');
    const d = await crearDepartamento();
    const nuevo = await agente
      .post('/api/feriados')
      .send({ fecha: '2026-12-24', nombre: 'Nochebuena' });
    expect(nuevo.status).toBe(201);
    expect(nuevo.body).toMatchObject({ fecha: '2026-12-24', departamento_id: null });

    expect(
      (await agente.post('/api/feriados').send({ fecha: '2026-12-24', nombre: 'Otra' })).status,
    ).toBe(409);
    // un feriado propio del departamento en la misma fecha sí es distinto
    expect(
      (
        await agente
          .post('/api/feriados')
          .send({ fecha: '2026-12-24', nombre: 'Propio', departamento_id: d.id })
      ).status,
    ).toBe(201);
    expect(
      (
        await agente
          .post('/api/feriados')
          .send({ fecha: '2026-12-30', nombre: 'X', departamento_id: 9999 })
      ).status,
    ).toBe(400);

    expect((await agente.delete(`/api/feriados/${nuevo.body.id}`)).status).toBe(204);
    expect((await agente.delete(`/api/feriados/${nuevo.body.id}`)).status).toBe(404);

    const a = await auditoria();
    const detalles = a.map((f: { detalle: Record<string, unknown> }) => f.detalle);
    expect(detalles).toContainEqual({ seccion: 'feriado', fecha: '2026-12-24', accion: 'creado' });
    expect(detalles).toContainEqual({
      seccion: 'feriado',
      fecha: '2026-12-24',
      accion: 'eliminado',
    });
    expect(a[0].usuario_id).toBe(usuario.id);
  });

  it('solo config.editar escribe', async () => {
    const { agente } = await sesion('lectura');
    expect((await agente.get('/api/feriados')).status).toBe(200);
    expect(
      (await agente.post('/api/feriados').send({ fecha: '2026-12-24', nombre: 'X' })).status,
    ).toBe(403);
  });
});
