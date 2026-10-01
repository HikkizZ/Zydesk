import type { HorarioDia, Rol } from '@zydesk/shared';
import { describe, expect, it } from 'vitest';
import {
  crearCliente,
  crearDepartamento,
  crearMensaje,
  crearOt,
  crearRegistroHoras,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: Rol, extra: { departamento_id?: number | null } = {}) {
  const usuario = await crearUsuario({ rol, ...extra });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

// L–J 08:30–18:00 con colación 60; V 08:30–16:30; S–D inactivos (0 = domingo)
const HORARIO: Omit<HorarioDia, 'departamento_id'>[] = [0, 1, 2, 3, 4, 5, 6].map((dia) => {
  const lab = dia >= 1 && dia <= 5;
  return {
    dia_semana: dia,
    activo: lab,
    entrada: '08:30',
    salida: dia === 5 ? '16:30' : '18:00',
    colacion_inicio: '13:00',
    colacion_min: lab ? 60 : 0,
  } as HorarioDia;
});

describe('GET /api/horas · semana (prueba 12)', () => {
  it('?semana=2026-10-01 normaliza al lunes y entrega los límites', async () => {
    const { agente } = await como('tecnico');
    const r = await agente.get('/api/horas?semana=2026-10-01');
    expect(r.status).toBe(200);
    expect(r.body.semana).toMatchObject({
      desde: '2026-09-28',
      hasta: '2026-10-04',
      anterior: '2026-09-21',
      siguiente: '2026-10-05',
    });
    expect(r.body.dias.map((d: { fecha: string }) => d.fecha)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(r.body.dias.map((d: { dia_semana: number }) => d.dia_semana)).toEqual([
      1, 2, 3, 4, 5, 6, 0,
    ]);
  });

  it('sin semana: la de hoy con actual: true; domingo y lunes caen en la semana correcta', async () => {
    const { agente } = await como('tecnico');
    const r = await agente.get('/api/horas');
    expect(r.status).toBe(200);
    expect(r.body.semana.actual).toBe(true);
    expect(r.body.dias.filter((d: { hoy: boolean }) => d.hoy)).toHaveLength(1);
    const dom = await agente.get('/api/horas?semana=2026-10-04');
    expect(dom.body.semana.desde).toBe('2026-09-28');
    expect((await agente.get('/api/horas?semana=2020-01-01')).body.semana.actual).toBe(false);
    const lun = await agente.get('/api/horas?semana=2026-09-28');
    expect(lun.body.semana.desde).toBe('2026-09-28');
  });

  it('una fila con fecha fuera de la semana no aparece', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket();
    await crearRegistroHoras(usuario.id, { ticket_id: t.id, fecha: '2026-09-27' });
    await crearRegistroHoras(usuario.id, { ticket_id: t.id, fecha: '2026-10-05' });
    await crearRegistroHoras(usuario.id, { ticket_id: t.id, fecha: '2026-09-28', horas: 2 });
    const r = await agente.get('/api/horas?semana=2026-09-30');
    expect(r.body.filas).toHaveLength(1);
    expect(r.body.totales.semana).toBe(2);
    expect(r.body.filas[0].celdas).toHaveLength(7);
  });

  it('semana inválida → 400', async () => {
    const { agente } = await como('tecnico');
    expect((await agente.get('/api/horas?semana=hoy')).status).toBe(400);
  });
});

describe('GET /api/horas · suma y clasificación (prueba 10)', () => {
  it('totales por tipo, facturable por fila y totales por día que cuadran', async () => {
    const { agente, usuario } = await como('tecnico');
    const cliente = await crearCliente();
    const t = await crearTicket({ cliente_id: cliente.id });
    const otF = await crearOt((await crearTicket()).id, {
      tipo: 'facturable',
      etapa: 'en_ejecucion',
      cliente_id: cliente.id,
    });
    const otI = await crearOt((await crearTicket()).id, { tipo: 'interna', etapa: 'en_ejecucion' });
    await crearRegistroHoras(usuario.id, { ot_id: otF.id, fecha: '2026-09-28', horas: 2 });
    await crearRegistroHoras(usuario.id, {
      ot_id: otF.id,
      fecha: '2026-09-29',
      horas: 1.5,
      fuera_de_horario: true,
    });
    await crearRegistroHoras(usuario.id, { ot_id: otI.id, fecha: '2026-09-28', horas: 1 });
    await crearRegistroHoras(usuario.id, { ticket_id: t.id, fecha: '2026-09-29', horas: 0.5 });
    await crearRegistroHoras(usuario.id, {
      descripcion: 'Reunión de equipo',
      fecha: '2026-09-30',
      horas: 1,
    });

    const r = await agente.get('/api/horas?semana=2026-09-28');
    expect(r.status).toBe(200);
    expect(r.body.totales).toMatchObject({
      semana: 6,
      facturables: 3.5,
      internas: 2.5,
      fuera_de_horario: 1.5,
    });
    const porClave = (c: string) => r.body.filas.find((f: { clave: string }) => f.clave === c);
    expect(porClave(`ot:${otF.id}`)).toMatchObject({ facturable: true, total: 3.5 });
    expect(porClave(`ot:${otI.id}`).facturable).toBe(false);
    expect(porClave(`ticket:${t.id}`).facturable).toBe(false);
    expect(porClave('sin_ticket:Reunión de equipo').destino).toEqual({
      tipo: 'sin_ticket',
      descripcion: 'Reunión de equipo',
    });
    expect(porClave(`ot:${otF.id}`).destino).toMatchObject({
      tipo: 'ot',
      tipo_ot: 'facturable',
      final: false,
      cliente: { id: cliente.id },
    });
    expect(porClave(`ticket:${t.id}`).destino).toMatchObject({
      tipo: 'ticket',
      cerrado: false,
      cliente: { id: cliente.id },
    });
    const celda = porClave(`ot:${otF.id}`).celdas[1];
    expect(celda).toMatchObject({ fecha: '2026-09-29', total: 1.5, fuera_de_horario: true });

    // los totales por día cuadran con las celdas
    for (let i = 0; i < 7; i++) {
      const suma = r.body.filas.reduce(
        (s: number, f: { celdas: { total: number }[] }) => s + f.celdas[i]!.total,
        0,
      );
      expect(r.body.dias[i].total).toBe(suma);
    }
    expect(r.body.dias.map((d: { total: number }) => d.total)).toEqual([3, 2, 1, 0, 0, 0, 0]);
  });

  it('suma varios registros en una celda, con tarea separa la fila y ordena OT, tickets y sin ticket', async () => {
    const { agente, usuario } = await como('tecnico');
    const t1 = await crearTicket();
    const ot = await crearOt(t1.id, { etapa: 'en_ejecucion' });
    const ta = await crearTarea({ ot_id: ot.id }, { titulo: 'Diagnóstico' });
    const tb = await crearTarea({ ot_id: ot.id }, { titulo: 'Informe' });
    await crearRegistroHoras(usuario.id, { descripcion: 'B reunión', fecha: '2026-09-28' });
    await crearRegistroHoras(usuario.id, { descripcion: 'A reunión', fecha: '2026-09-28' });
    await crearRegistroHoras(usuario.id, { ticket_id: t1.id, fecha: '2026-09-28' });
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, tarea_id: tb.id, fecha: '2026-09-28' });
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, tarea_id: ta.id, fecha: '2026-09-28' });
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, fecha: '2026-09-28', horas: 2 });
    const seg = await crearMensaje({ ot_id: ot.id }, { autor_id: usuario.id, horas: 0.5 });
    await crearRegistroHoras(usuario.id, {
      ot_id: ot.id,
      fecha: '2026-09-28',
      horas: 0.5,
      mensaje_id: seg.id,
    });

    const r = await agente.get('/api/horas?semana=2026-09-28');
    expect(r.body.filas.map((f: { clave: string }) => f.clave)).toEqual([
      `ot:${ot.id}`,
      `ot:${ot.id}:tarea:${ta.id}`,
      `ot:${ot.id}:tarea:${tb.id}`,
      `ticket:${t1.id}`,
      'sin_ticket:A reunión',
      'sin_ticket:B reunión',
    ]);
    const filaOt = r.body.filas[0];
    expect(filaOt.celdas[0]).toMatchObject({ total: 2.5 });
    expect(filaOt.celdas[0].registros).toHaveLength(2);
    expect(r.body.filas[1].tarea).toEqual({ id: ta.id, titulo: 'Diagnóstico', hecha: false });
  });
});

describe('GET /api/horas · jornada (prueba 11)', () => {
  it('jornada por día frente al horario del departamento y feriados', async () => {
    const depto = await crearDepartamento({ horario: HORARIO });
    const { agente } = await como('tecnico', { departamento_id: depto.id });
    const r = await agente.get('/api/horas?semana=2026-09-28');
    expect(r.body.dias.map((d: { jornada: number }) => d.jornada)).toEqual([
      8.5, 8.5, 8.5, 8.5, 7, 0, 0,
    ]);
    expect(r.body.totales.jornada_semanal).toBe(41);
    expect(r.body.usuario.departamento).toEqual({ id: depto.id, nombre: depto.nombre });

    // feriado el jueves (general)
    await dataSource.query(
      `INSERT INTO feriado (fecha, nombre) VALUES ('2026-10-01', 'Feriado de prueba')`,
    );
    const f = await agente.get('/api/horas?semana=2026-09-28');
    expect(f.body.dias[3]).toMatchObject({ jornada: 0, feriado: 'Feriado de prueba' });
    expect(f.body.dias[0].feriado).toBeNull();
    expect(f.body.totales.jornada_semanal).toBe(32.5);
  });

  it('feriado propio del departamento cuenta; el de otro departamento no', async () => {
    const depto = await crearDepartamento({ horario: HORARIO });
    const otro = await crearDepartamento({ horario: HORARIO });
    const { agente } = await como('tecnico', { departamento_id: depto.id });
    await dataSource.query(
      `INSERT INTO feriado (fecha, nombre, departamento_id) VALUES ('2026-09-29', 'Propio', $1), ('2026-09-30', 'Ajeno', $2)`,
      [depto.id, otro.id],
    );
    const r = await agente.get('/api/horas?semana=2026-09-28');
    expect(r.body.dias[1]).toMatchObject({ feriado: 'Propio', jornada: 0 });
    expect(r.body.dias[2]).toMatchObject({ feriado: null, jornada: 8.5 });
  });

  it('persona sin departamento: jornada null y jornada_semanal null', async () => {
    const { agente } = await como('tecnico');
    const r = await agente.get('/api/horas?semana=2026-09-28');
    expect(r.body.usuario.departamento).toBeNull();
    expect(r.body.dias.every((d: { jornada: number | null }) => d.jornada === null)).toBe(true);
    expect(r.body.totales.jornada_semanal).toBeNull();
  });
});

describe('GET /api/horas · permisos de lectura (prueba 2) y usuario desactivado (prueba 14)', () => {
  it('lectura: planilla propia vacía con editable false; la de otro → 403', async () => {
    const lectura = await como('lectura');
    const otro = await crearUsuario({ rol: 'tecnico' });
    const r = await lectura.agente.get('/api/horas');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ filas: [], editable: false });
    const ajena = await lectura.agente.get(`/api/horas?usuario_id=${otro.id}`);
    expect(ajena.status).toBe(403);
    expect(ajena.body.error.codigo).toBe('SIN_PERMISO');
  });

  it('técnico: propia editable true; la de otro → 403', async () => {
    const t = await como('tecnico');
    const otro = await crearUsuario({ rol: 'tecnico' });
    expect((await t.agente.get('/api/horas')).body.editable).toBe(true);
    expect((await t.agente.get(`/api/horas?usuario_id=${otro.id}`)).status).toBe(403);
    // pedir la propia por id también vale
    expect((await t.agente.get(`/api/horas?usuario_id=${t.usuario.id}`)).status).toBe(200);
  });

  it.each(['coordinacion', 'admin'] as const)(
    '%s ve la planilla de un técnico con editable: false',
    async (rol) => {
      const { agente } = await como(rol);
      const tec = await crearUsuario({ rol: 'tecnico' });
      const t = await crearTicket();
      await crearRegistroHoras(tec.id, { ticket_id: t.id, fecha: '2026-09-28', horas: 3 });
      const r = await agente.get(`/api/horas?usuario_id=${tec.id}&semana=2026-09-28`);
      expect(r.status).toBe(200);
      expect(r.body.editable).toBe(false);
      expect(r.body.usuario.id).toBe(tec.id);
      expect(r.body.totales.semana).toBe(3);
    },
  );

  it('usuario inexistente → 404; desactivado visible con ver_todas', async () => {
    const { agente } = await como('coordinacion');
    expect((await agente.get('/api/horas?usuario_id=999999')).status).toBe(404);
    const inactivo = await crearUsuario({ rol: 'tecnico', activo: false });
    const t = await crearTicket();
    await crearRegistroHoras(inactivo.id, { ticket_id: t.id, fecha: '2026-09-28', horas: 4 });
    const r = await agente.get(`/api/horas?usuario_id=${inactivo.id}&semana=2026-09-28`);
    expect(r.status).toBe(200);
    expect(r.body.usuario.activo).toBe(false);
    expect(r.body.totales.semana).toBe(4);
  });

  it('ticket cerrado aparece con cerrado: true', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket({ estado: 'resuelto' });
    await crearRegistroHoras(usuario.id, { ticket_id: t.id, fecha: '2026-09-28' });
    const r = await agente.get('/api/horas?semana=2026-09-28');
    expect(r.body.filas[0].destino.cerrado).toBe(true);
  });
});
