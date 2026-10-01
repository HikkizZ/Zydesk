import { decimalesDe, formatearCLP, formatearFecha, redondear } from '@zydesk/shared';
import ExcelJS from 'exceljs';
import type { CotizacionSalidaDatos } from '../../modulos/cotizaciones/cotizaciones.tipos.js';
import type { MarcaDocumento } from '../documentos.js';

const FORMATO_FECHA = 'dd-mm-yyyy';

// AAAA-MM-DD como fecha de Excel (mediodía UTC para que la zona no cambie el día).
const aFecha = (f: string): Date => new Date(`${f}T12:00:00Z`);

// Planilla de la cotización (spec fase 4 §7.1): fórmulas con `result` calculado por `shared` para que se
// vea bien aunque el visor no recalcule. Nunca incluye `nota_interna`; la descripción siempre es texto.
export async function generarXlsx(
  cot: CotizacionSalidaDatos,
  marca: MarcaDocumento,
): Promise<Buffer> {
  const d = decimalesDe(cot.moneda);
  const formatoMonto = d === 0 ? '#,##0' : '#,##0.00';
  const wb = new ExcelJS.Workbook();
  wb.creator = marca.nombre_app;
  wb.created = new Date();
  const ws = wb.addWorksheet('Cotización', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 20 },
    { width: 16 },
    { width: 46 },
    { width: 10 },
    { width: 8 },
    { width: 16 },
    { width: 9 },
    { width: 16 },
    { width: 16, hidden: true }, // I: Bruto (subtotal por línea)
  ];

  const titulo = `Cotización ${cot.codigo} v${cot.version}`;
  ws.getCell('A1').value = marca.nombre_app;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = cot.estado === 'borrador' ? `BORRADOR · ${titulo}` : titulo;
  ws.getCell('A2').font = { bold: true, size: 12 };

  const etiqueta = (celda: string, texto: string): void => {
    ws.getCell(celda).value = texto;
    ws.getCell(celda).font = { bold: true };
  };
  etiqueta('A3', 'Fecha de emisión');
  ws.getCell('B3').value = aFecha(cot.fecha_emision);
  ws.getCell('B3').numFmt = FORMATO_FECHA;
  ws.getCell('B3').alignment = { horizontal: 'left' };
  etiqueta('D3', 'Válida hasta');
  ws.getCell('F3').value = aFecha(cot.vence_el);
  ws.getCell('F3').numFmt = FORMATO_FECHA;
  ws.getCell('F3').alignment = { horizontal: 'left' };
  etiqueta('A4', 'Cliente');
  ws.getCell('B4').value = cot.cliente?.nombre ?? '';
  etiqueta('D4', 'Contacto');
  ws.getCell('F4').value = cot.contacto
    ? [cot.contacto.nombre, cot.contacto.correo].filter(Boolean).join(' · ')
    : '';
  etiqueta('A5', 'Orden de trabajo');
  ws.getCell('B5').value = `${cot.ot.codigo} · ${cot.ot.titulo}`;
  etiqueta('A6', 'Ticket');
  ws.getCell('B6').value = cot.ot.ticket.codigo;
  if (cot.moneda === 'UF' && cot.valor_uf !== null) {
    ws.getCell('D6').value =
      `Valor UF al ${formatearFecha(aFecha(cot.fecha_emision))}: ${formatearCLP(cot.valor_uf)}`;
  }
  etiqueta('A7', 'Aplica IVA');
  ws.getCell('B7').value = cot.aplica_iva;
  ws.getCell('B7').alignment = { horizontal: 'left' };
  etiqueta('D7', 'IVA %');
  ws.getCell('F7').value = cot.iva_pct;
  ws.getCell('F7').numFmt = '0.00';
  ws.getCell('F7').alignment = { horizontal: 'left' };

  const cabecera = ws.getRow(9);
  cabecera.values = [
    'N°',
    'Tipo',
    'Descripción',
    'Cantidad',
    'Unidad',
    'Precio unitario',
    'Desc. %',
    'Total',
    'Bruto',
  ];
  cabecera.font = { bold: true };
  cabecera.alignment = { horizontal: 'center' };

  const primera = 10;
  const ultima = Math.max(primera, primera + cot.lineas.length - 1);
  for (const [i, l] of cot.lineas.entries()) {
    const r = primera + i;
    const fila = ws.getRow(r);
    fila.getCell(1).value = l.orden;
    fila.getCell(2).value = l.tipo;
    fila.getCell(3).value = String(l.descripcion); // siempre texto, nunca fórmula
    fila.getCell(4).value = l.cantidad;
    fila.getCell(5).value = l.unidad;
    fila.getCell(6).value = l.precio_unitario;
    fila.getCell(7).value = l.descuento_pct;
    fila.getCell(8).value = { formula: `ROUND(D${r}*F${r}*(1-G${r}/100),${d})`, result: l.total };
    fila.getCell(9).value = {
      formula: `ROUND(D${r}*F${r},${d})`,
      result: redondear(l.cantidad * l.precio_unitario, cot.moneda),
    };
    fila.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    for (const c of [4, 7]) fila.getCell(c).numFmt = '0.00';
    for (const c of [6, 8, 9]) fila.getCell(c).numFmt = formatoMonto;
  }

  // Totales: etiquetas en G, fórmulas en H (con `result`)
  const t = ultima + 2;
  const filas = {
    subtotal: t,
    descuentos: t + 1,
    neto: t + 2,
    iva: t + 3,
    total: t + 4,
  };
  const totales = cot.totales;
  const poner = (fila: number, texto: string, formula: string, result: number): void => {
    ws.getCell(`G${fila}`).value = texto;
    ws.getCell(`G${fila}`).font = { bold: true };
    ws.getCell(`G${fila}`).alignment = { horizontal: 'right' };
    ws.getCell(`H${fila}`).value = { formula, result };
    ws.getCell(`H${fila}`).numFmt = formatoMonto;
  };
  poner(filas.subtotal, 'Subtotal', `SUM(I${primera}:I${ultima})`, totales.subtotal);
  poner(filas.descuentos, 'Descuentos', `H${filas.subtotal}-H${filas.neto}`, totales.descuentos);
  poner(filas.neto, 'Neto', `SUM(H${primera}:H${ultima})`, totales.neto);
  poner(filas.iva, 'IVA', `IF($B$7,ROUND(H${filas.neto}*$F$7/100,${d}),0)`, totales.iva);
  poner(filas.total, 'Total', `H${filas.neto}+H${filas.iva}`, totales.total);
  ws.getCell(`H${filas.total}`).font = { bold: true };

  if (cot.condiciones) {
    const r = filas.total + 2;
    ws.getCell(`A${r}`).value = 'Condiciones comerciales';
    ws.getCell(`A${r}`).font = { bold: true };
    ws.mergeCells(`A${r + 1}:H${r + 1}`);
    const celda = ws.getCell(`A${r + 1}`);
    celda.value = String(cot.condiciones);
    celda.alignment = { wrapText: true, vertical: 'top' };
    const lineas = cot.condiciones
      .split('\n')
      .reduce((n, linea) => n + Math.max(1, Math.ceil(linea.length / 120)), 0);
    ws.getRow(r + 1).height = Math.min(409, 15 * lineas);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
