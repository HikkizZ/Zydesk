import { ETIQUETA_PRIORIDAD } from '@zydesk/shared';
import ExcelJS from 'exceljs';
import type { ReporteSalidaDatos } from '../../modulos/reportes/reportes.tipos.js';

const FORMATO_FECHA = 'dd-mm-yyyy';

// AAAA-MM-DD como fecha de Excel (mediodía UTC para que la zona no cambie el día).
const aFecha = (f: string): Date => new Date(`${f}T12:00:00Z`);

const redondear2 = (n: number): number => Math.round(n * 100) / 100;

function cabecera(ws: ExcelJS.Worksheet, titulos: string[], anchos: number[]): void {
  ws.columns = anchos.map((width) => ({ width }));
  const fila = ws.getRow(1);
  fila.values = titulos;
  fila.font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// Fila de totales al pie: `SUM` con `result` calculado (las únicas fórmulas del libro).
function pieSuma(
  ws: ExcelJS.Worksheet,
  fila: number,
  primera: number,
  ultima: number,
  columnas: { col: number; letra: string; total: number; formato: string }[],
): void {
  ws.getCell(fila, 1).value = 'Totales';
  ws.getCell(fila, 1).font = { bold: true };
  for (const c of columnas) {
    const celda = ws.getCell(fila, c.col);
    celda.value = { formula: `SUM(${c.letra}${primera}:${c.letra}${ultima})`, result: c.total };
    celda.numFmt = c.formato;
    celda.font = { bold: true };
  }
}

// Reportes (spec fase 7 §5.4): cinco hojas. Los textos (clientes, personas) siempre van como texto (ADR 0025.18);
// las únicas fórmulas son los `SUM` de los pies. Sin notas internas, descripciones, ids ni números de factura.
export async function generarXlsxReportes(
  reporte: ReporteSalidaDatos,
  nombreApp: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = nombreApp;
  wb.created = new Date();
  const { filtros, indicadores: ind } = reporte;

  // ---- Resumen ----
  const resumen = wb.addWorksheet('Resumen');
  resumen.columns = [
    { width: 36 },
    { width: 22 },
    { width: 14 },
    { width: 22 },
    { width: 14 },
    { width: 22 },
  ];
  resumen.getCell('A1').value = 'Período';
  resumen.getCell('B1').value = aFecha(filtros.desde);
  resumen.getCell('C1').value = aFecha(filtros.hasta);
  resumen.getCell('B1').numFmt = FORMATO_FECHA;
  resumen.getCell('C1').numFmt = FORMATO_FECHA;
  resumen.getCell('A2').value = 'Departamento';
  resumen.getCell('B2').value = filtros.departamento?.nombre ?? 'Todos';
  resumen.getCell('C2').value = 'Cliente';
  resumen.getCell('D2').value = filtros.cliente?.nombre ?? 'Todos';
  resumen.getCell('E2').value = 'Persona';
  resumen.getCell('F2').value = filtros.usuario?.nombre ?? 'Todos';
  for (const c of ['A1', 'A2', 'C2', 'E2']) resumen.getCell(c).font = { bold: true };

  const pares: [string, number | null, string][] = [
    ['Tickets cerrados', ind.cerrados.total, '0'],
    ['Resueltos', ind.cerrados.resueltos, '0'],
    ['Descartados', ind.cerrados.descartados, '0'],
    ['Duplicados', ind.cerrados.duplicados, '0'],
    ['Resolución promedio (días hábiles)', ind.resolucion.promedio_dias, '0.00'],
    ['Tickets sin calendario', ind.resolucion.sin_calendario, '0'],
    ['Resueltos dentro de plazo (%)', ind.dentro_de_plazo.pct, '0'],
    ['Horas totales', ind.horas.total, '0.00'],
    ['Horas facturables', ind.horas.facturables, '0.00'],
    ['Horas internas', ind.horas.internas, '0.00'],
    ['Horas fuera de horario', ind.horas.fuera_de_horario, '0.00'],
    ['% horas facturables', ind.horas.pct_facturables, '0'],
  ];
  for (const [i, [etiqueta, valor, formato]] of pares.entries()) {
    const fila = 4 + i;
    resumen.getCell(fila, 1).value = etiqueta;
    if (valor !== null) {
      resumen.getCell(fila, 2).value = valor;
      resumen.getCell(fila, 2).numFmt = formato;
    }
  }

  // ---- Horas por semana ----
  const semanas = wb.addWorksheet('Horas por semana');
  cabecera(semanas, ['Semana (lunes)', 'Facturables', 'Internas', 'Total'], [16, 14, 14, 14]);
  for (const [i, s] of reporte.horas_por_semana.entries()) {
    const fila = semanas.getRow(2 + i);
    fila.getCell(1).value = aFecha(s.semana);
    fila.getCell(1).numFmt = FORMATO_FECHA;
    fila.getCell(2).value = s.facturables;
    fila.getCell(3).value = s.internas;
    fila.getCell(4).value = redondear2(s.facturables + s.internas);
    for (const c of [2, 3, 4]) fila.getCell(c).numFmt = '0.00';
  }
  const ultimaSemana = Math.max(2, 1 + reporte.horas_por_semana.length);
  const sumaSemanas = (campo: 'facturables' | 'internas'): number =>
    redondear2(reporte.horas_por_semana.reduce((t, s) => t + s[campo], 0));
  pieSuma(semanas, ultimaSemana + 2, 2, ultimaSemana, [
    { col: 2, letra: 'B', total: sumaSemanas('facturables'), formato: '0.00' },
    { col: 3, letra: 'C', total: sumaSemanas('internas'), formato: '0.00' },
    {
      col: 4,
      letra: 'D',
      total: redondear2(sumaSemanas('facturables') + sumaSemanas('internas')),
      formato: '0.00',
    },
  ]);

  // ---- Carga vs capacidad ----
  const carga = wb.addWorksheet('Carga vs capacidad');
  cabecera(
    carga,
    [
      'Persona',
      'Departamento',
      'Tickets abiertos',
      'Horas estimadas',
      'Capacidad semanal',
      '% de la capacidad',
    ],
    [28, 22, 16, 16, 18, 18],
  );
  for (const [i, p] of reporte.carga.entries()) {
    const fila = carga.getRow(2 + i);
    fila.getCell(1).value = p.usuario.nombre;
    fila.getCell(2).value = p.departamento?.nombre ?? '';
    fila.getCell(3).value = p.tickets_abiertos;
    fila.getCell(4).value = p.horas_estimadas;
    if (p.capacidad_semanal !== null) fila.getCell(5).value = p.capacidad_semanal;
    if (p.pct !== null) fila.getCell(6).value = p.pct;
    fila.getCell(3).numFmt = '0';
    fila.getCell(4).numFmt = '0.00';
    fila.getCell(5).numFmt = '0.0';
    fila.getCell(6).numFmt = '0';
  }

  // ---- Resolución por prioridad ----
  const resolucion = wb.addWorksheet('Resolución por prioridad');
  cabecera(
    resolucion,
    ['Prioridad', 'Tickets', 'Promedio (días hábiles)', 'Objetivo (días hábiles)', 'Sobre plazo'],
    [14, 10, 24, 24, 14],
  );
  for (const [i, r] of reporte.resolucion_por_prioridad.entries()) {
    const fila = resolucion.getRow(2 + i);
    fila.getCell(1).value = ETIQUETA_PRIORIDAD[r.prioridad];
    fila.getCell(2).value = r.n;
    if (r.promedio_dias !== null) fila.getCell(3).value = r.promedio_dias;
    if (r.objetivo_dias !== null) fila.getCell(4).value = r.objetivo_dias;
    fila.getCell(5).value = r.sobre_plazo ? 'Sí' : 'No';
    fila.getCell(2).numFmt = '0';
    fila.getCell(3).numFmt = '0.00';
    fila.getCell(4).numFmt = '0.00';
  }

  // ---- Por cliente ----
  const clientes = wb.addWorksheet('Por cliente');
  cabecera(
    clientes,
    ['Cliente', 'Abiertos', 'Cerrados', 'Horas', 'Facturado CLP', 'Por facturar CLP'],
    [32, 10, 10, 12, 16, 18],
  );
  for (const [i, c] of reporte.por_cliente.entries()) {
    const fila = clientes.getRow(2 + i);
    fila.getCell(1).value = c.nombre;
    fila.getCell(2).value = c.abiertos;
    fila.getCell(3).value = c.cerrados;
    fila.getCell(4).value = c.horas;
    if (c.facturado !== null) fila.getCell(5).value = c.facturado;
    if (c.por_facturar !== null) fila.getCell(6).value = c.por_facturar;
    fila.getCell(2).numFmt = '0';
    fila.getCell(3).numFmt = '0';
    fila.getCell(4).numFmt = '0.00';
    fila.getCell(5).numFmt = '#,##0';
    fila.getCell(6).numFmt = '#,##0';
  }
  const ultimaCliente = Math.max(2, 1 + reporte.por_cliente.length);
  const suma = (campo: 'horas' | 'facturado' | 'por_facturar'): number =>
    redondear2(reporte.por_cliente.reduce((t, c) => t + (c[campo] ?? 0), 0));
  pieSuma(clientes, ultimaCliente + 2, 2, ultimaCliente, [
    { col: 4, letra: 'D', total: suma('horas'), formato: '0.00' },
    { col: 5, letra: 'E', total: suma('facturado'), formato: '#,##0' },
    { col: 6, letra: 'F', total: suma('por_facturar'), formato: '#,##0' },
  ]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
