import { ETIQUETA_ESTADO_FACTURACION, ETIQUETA_ETAPA_OT, ETIQUETA_TIPO_OT } from '@zydesk/shared';
import ExcelJS from 'exceljs';
import type { FilaExportacionOt } from '../../modulos/ots/ots.tipos.js';

const FORMATO_FECHA = 'dd-mm-yyyy';

// AAAA-MM-DD como fecha de Excel (mediodía UTC para que la zona no cambie el día).
const aFecha = (f: string): Date => new Date(`${f}T12:00:00Z`);
const fechaSantiago = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(d);

const COLUMNAS = [
  { titulo: 'OT', ancho: 12 },
  { titulo: 'Título', ancho: 40 },
  { titulo: 'Cliente', ancho: 28 },
  { titulo: 'Ticket', ancho: 12 },
  { titulo: 'Tipo', ancho: 12 },
  { titulo: 'Etapa', ancho: 14 },
  { titulo: 'Estado de facturación', ancho: 22 },
  { titulo: 'N° factura', ancho: 14 },
  { titulo: 'Cotización vigente', ancho: 18 },
  { titulo: 'Neto CLP', ancho: 14 },
  { titulo: 'Horas registradas', ancho: 12 },
  { titulo: 'Responsable', ancho: 22 },
  { titulo: 'Inicio', ancho: 12 },
  { titulo: 'Término', ancho: 12 },
  { titulo: 'Cerrada el', ancho: 12 },
] as const;

const COL_NETO = 10;
const COL_HORAS = 11;

// Planilla de facturación (spec fase 6 §12): los textos siempre van como texto (ADR 0025.18: nunca una
// fórmula a partir de datos); los totales al pie son fórmulas `SUM` con `result` calculado.
export async function generarXlsxOts(
  filas: FilaExportacionOt[],
  nombreApp: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = nombreApp;
  wb.created = new Date();
  const ws = wb.addWorksheet('Órdenes de trabajo', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNAS.map((c) => ({ width: c.ancho }));

  const cabecera = ws.getRow(1);
  cabecera.values = COLUMNAS.map((c) => c.titulo);
  cabecera.font = { bold: true };

  const texto = (v: string | null): string => (v === null ? '' : String(v));
  for (const [i, f] of filas.entries()) {
    const fila = ws.getRow(2 + i);
    fila.getCell(1).value = texto(f.codigo);
    fila.getCell(2).value = texto(f.titulo);
    fila.getCell(3).value = texto(f.cliente);
    fila.getCell(4).value = texto(f.ticket);
    fila.getCell(5).value = ETIQUETA_TIPO_OT[f.tipo];
    fila.getCell(6).value = ETIQUETA_ETAPA_OT[f.etapa];
    fila.getCell(7).value = ETIQUETA_ESTADO_FACTURACION[f.estado_facturacion];
    fila.getCell(8).value = texto(f.n_factura);
    fila.getCell(9).value = texto(f.cotizacion);
    if (f.neto !== null) fila.getCell(COL_NETO).value = f.neto;
    fila.getCell(COL_HORAS).value = f.horas;
    fila.getCell(12).value = texto(f.responsable);
    if (f.inicio) fila.getCell(13).value = aFecha(f.inicio);
    if (f.termino) fila.getCell(14).value = aFecha(f.termino);
    if (f.cerrada_en) fila.getCell(15).value = aFecha(fechaSantiago(f.cerrada_en));
    fila.getCell(COL_NETO).numFmt = '#,##0';
    fila.getCell(COL_HORAS).numFmt = '0.00';
    for (const c of [13, 14, 15]) fila.getCell(c).numFmt = FORMATO_FECHA;
  }

  const primera = 2;
  const ultima = Math.max(primera, 1 + filas.length);
  const t = ultima + 2;
  ws.getCell(`A${t}`).value = 'Totales';
  ws.getCell(`A${t}`).font = { bold: true };
  const totalNeto = filas.reduce((s, f) => s + (f.neto ?? 0), 0);
  const totalHoras = Math.round(filas.reduce((s, f) => s + f.horas, 0) * 100) / 100;
  ws.getCell(t, COL_NETO).value = { formula: `SUM(J${primera}:J${ultima})`, result: totalNeto };
  ws.getCell(t, COL_NETO).numFmt = '#,##0';
  ws.getCell(t, COL_HORAS).value = { formula: `SUM(K${primera}:K${ultima})`, result: totalHoras };
  ws.getCell(t, COL_HORAS).numFmt = '0.00';
  ws.getCell(t, COL_NETO).font = { bold: true };
  ws.getCell(t, COL_HORAS).font = { bold: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
