import type { HorarioDia } from '@zydesk/shared';
import ExcelJS from 'exceljs';
import type request from 'supertest';
import {
  crearCategoria,
  crearCliente,
  crearCotizacion,
  crearDepartamento,
  crearOt,
  crearRegistroHoras,
  crearTarea,
  crearTicket,
  crearUsuario,
} from './fabricas.js';

// Escenario de fábricas con fechas fijas de la spec fase 7 §10.2 (instantes en hora de Santiago, -03:00).

const horario = (viernesSalida: string, entrada: string, salida: string): HorarioDia[] =>
  [0, 1, 2, 3, 4, 5, 6].map((dia) => {
    const laboral = dia >= 1 && dia <= 5;
    return {
      dia_semana: dia,
      activo: laboral,
      entrada: laboral ? entrada : '09:00',
      salida: dia === 5 ? viernesSalida : laboral ? salida : '13:00',
      colacion_inicio: '13:00',
      colacion_min: laboral ? 60 : 0,
    };
  });

export const en = (fecha: string, hora: string): Date => new Date(`${fecha}T${hora}:00-03:00`);

export const PLAZOS = {
  urgente: { valor: 1, unidad: 'dias' },
  alta: { valor: 1, unidad: 'dias' },
  media: { valor: 2, unidad: 'dias' },
  baja: { valor: 3, unidad: 'dias' },
} as const;

export async function montarEscenario() {
  const soporte = await crearDepartamento({
    nombre: 'Soporte TI',
    capacidad_tickets_pct: 80,
    horario: horario('16:30', '08:30', '18:00'),
  });
  const coordinacion = await crearDepartamento({
    nombre: 'Coordinación',
    capacidad_tickets_pct: 50,
    horario: horario('17:00', '09:00', '18:00'),
  });
  const tecA = await crearUsuario({
    nombre: 'Ana Técnica',
    rol: 'tecnico',
    departamento_id: soporte.id,
  });
  const tecB = await crearUsuario({
    nombre: 'Bruno Técnico',
    rol: 'tecnico',
    departamento_id: soporte.id,
  });
  const coord = await crearUsuario({
    nombre: 'Carla Coordinación',
    rol: 'coordinacion',
    departamento_id: coordinacion.id,
  });
  const lect = await crearUsuario({
    nombre: 'Beto Lectura',
    rol: 'lectura',
    departamento_id: soporte.id,
  });
  const cat = await crearCategoria({ plazo_resolucion: { ...PLAZOS } });
  const vina = await crearCliente({ nombre: 'Viña' });
  const clinica = await crearCliente({ nombre: 'Clínica' });
  const transportes = await crearCliente({ nombre: 'Transportes' });
  const operaciones = await crearCliente({ nombre: 'Operaciones', es_interno: true });

  const base = { categoria_id: cat.id };
  const t1 = await crearTicket({
    ...base,
    prioridad: 'alta',
    cliente_id: vina.id,
    principal_id: tecA.id,
    creado_en: en('2026-09-28', '10:00'),
    estado: 'resuelto',
    cerrado_en: en('2026-09-30', '10:00'),
    fecha_limite: en('2026-09-29', '23:00'),
  });
  const t2 = await crearTicket({
    ...base,
    prioridad: 'media',
    cliente_id: vina.id,
    principal_id: tecA.id,
    creado_en: en('2026-09-28', '08:30'),
    estado: 'resuelto',
    cerrado_en: en('2026-09-28', '18:00'),
    fecha_limite: en('2026-09-30', '23:00'),
  });
  const t3 = await crearTicket({
    ...base,
    prioridad: 'baja',
    cliente_id: clinica.id,
    principal_id: tecB.id,
    creado_en: en('2026-10-01', '08:30'),
    estado: 'resuelto',
    cerrado_en: en('2026-10-02', '16:30'),
    fecha_limite: en('2026-10-06', '23:00'),
  });
  const t4 = await crearTicket({
    ...base,
    prioridad: 'media',
    cliente_id: clinica.id,
    principal_id: tecB.id,
    creado_en: en('2026-10-01', '09:00'),
    estado: 'descartado',
    cerrado_en: en('2026-10-01', '12:00'),
  });
  const t5 = await crearTicket({
    ...base,
    prioridad: 'urgente',
    cliente_id: transportes.id,
    principal_id: tecA.id,
    creado_en: en('2026-10-02', '08:30'),
    estado: 'resuelto',
    cerrado_en: en('2026-10-02', '16:30'),
    fecha_limite: en('2026-10-02', '23:00'),
  });
  const t6 = await crearTicket({
    ...base,
    prioridad: 'alta',
    cliente_id: vina.id,
    principal_id: tecA.id,
    creado_en: en('2026-09-28', '09:00'),
    estado: 'en_curso',
    horas_estimadas: 6,
  });
  const t7 = await crearTicket({
    ...base,
    prioridad: 'media',
    cliente_id: clinica.id,
    principal_id: tecB.id,
    otros_ids: [tecA.id],
    creado_en: en('2026-09-29', '09:00'),
    estado: 'nuevo',
    horas_estimadas: 4,
  });
  const t8 = await crearTicket({
    ...base,
    prioridad: 'media',
    cliente_id: vina.id,
    principal_id: tecA.id,
    creado_en: en('2026-09-14', '09:00'),
    estado: 'resuelto',
    cerrado_en: en('2026-09-15', '09:00'),
  });
  const t9 = await crearTicket({
    ...base,
    prioridad: 'media',
    cliente_id: transportes.id,
    principal_id: tecB.id,
    creado_en: en('2026-09-29', '09:00'),
    estado: 'duplicado',
    duplicado_de_id: t6.id,
    cerrado_en: en('2026-09-30', '11:00'),
  });
  const t10 = await crearTicket({
    ...base,
    prioridad: 'media',
    cliente_id: operaciones.id,
    principal_id: tecB.id,
    creado_en: en('2026-09-29', '09:00'),
    estado: 'en_curso',
  });

  const o1 = await crearOt(t6.id, {
    tipo: 'facturable',
    etapa: 'en_ejecucion',
    cliente_id: vina.id,
    responsable_tecnico_id: tecA.id,
  });
  await crearTarea({ ot_id: o1.id }, { responsable_id: tecA.id, horas_estimadas: 4 });
  const o2 = await crearOt(t10.id, {
    tipo: 'interna',
    etapa: 'en_ejecucion',
    cliente_id: operaciones.id,
    responsable_tecnico_id: tecB.id,
  });
  const o3 = await crearOt(t2.id, {
    tipo: 'facturable',
    etapa: 'cerrada',
    cliente_id: vina.id,
    responsable_tecnico_id: tecA.id,
  });
  await crearCotizacion(o3.id, {
    estado: 'aprobada',
    lineas: [{ cantidad: 1, precio_unitario: 680_000 }],
  });
  const o4 = await crearOt(t3.id, {
    tipo: 'facturable',
    etapa: 'cerrada',
    cliente_id: clinica.id,
    responsable_tecnico_id: tecB.id,
    estado_facturacion: 'facturada',
    n_factura: 'F-1',
    facturada_en: en('2026-10-01', '12:00'),
  });
  await crearCotizacion(o4.id, {
    estado: 'aprobada',
    lineas: [{ cantidad: 1, precio_unitario: 250_000 }],
  });

  await crearRegistroHoras(tecA.id, { ot_id: o1.id, fecha: '2026-09-28', horas: 3 });
  await crearRegistroHoras(tecA.id, { ot_id: o1.id, fecha: '2026-09-29', horas: 2 });
  await crearRegistroHoras(tecA.id, { ot_id: o1.id, fecha: '2026-09-23', horas: 2 });
  await crearRegistroHoras(tecA.id, { ticket_id: t6.id, fecha: '2026-09-30', horas: 1.5 });
  await crearRegistroHoras(tecA.id, {
    fecha: '2026-10-01',
    horas: 1,
    descripcion: 'Trabajo sin ticket reservado',
  });
  await crearRegistroHoras(tecB.id, {
    ot_id: o2.id,
    fecha: '2026-10-01',
    horas: 2,
    fuera_de_horario: true,
  });
  await crearRegistroHoras(tecB.id, { ticket_id: t3.id, fecha: '2026-10-02', horas: 0.5 });

  return {
    soporte,
    coordinacion,
    tecA,
    tecB,
    coord,
    lect,
    cat,
    vina,
    clinica,
    transportes,
    operaciones,
    tickets: { t1, t2, t3, t4, t5, t6, t7, t8, t9, t10 },
    ots: { o1, o2, o3, o4 },
  };
}

export const QUERY_BASE = 'desde=2026-09-28&hasta=2026-10-04';

type Agente = ReturnType<typeof request.agent>;

// GET binario (el .xlsx) como Buffer.
export const descargar = (agente: Agente, url: string) =>
  agente
    .get(url)
    .buffer(true)
    .parse((res, cb) => {
      const trozos: Buffer[] = [];
      res.on('data', (t: Buffer) => trozos.push(t));
      res.on('end', () => cb(null, Buffer.concat(trozos)));
    });

export async function leerLibro(r: { body: unknown }): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.body as Buffer as unknown as ExcelJS.Buffer);
  return wb;
}

// Valor de la celda de la columna `col` en la fila cuya columna A vale `etiqueta`.
export function celdaDe(ws: ExcelJS.Worksheet, etiqueta: string, col: number): ExcelJS.Cell {
  let fila: ExcelJS.Row | undefined;
  ws.eachRow((f) => {
    if (f.getCell(1).value === etiqueta) fila = f;
  });
  if (!fila) throw new Error(`Sin fila «${etiqueta}» en ${ws.name}`);
  return fila.getCell(col);
}
