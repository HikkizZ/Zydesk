import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { cotizacionDePrueba } from '../../../test/cotizacion-salida.js';
import { generarXlsx } from './cotizacion.xlsx.js';

const marca = { nombre_app: 'Zydesk' };

async function leer(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb.getWorksheet('Cotización')!;
}

// Busca la fila de un total por su etiqueta en la columna G.
const totalDe = (ws: ExcelJS.Worksheet, etiqueta: string): ExcelJS.CellFormulaValue => {
  let valor: ExcelJS.CellFormulaValue | undefined;
  ws.eachRow((fila) => {
    if (fila.getCell('G').value === etiqueta) {
      valor = fila.getCell('H').value as ExcelJS.CellFormulaValue;
    }
  });
  return valor!;
};

const linea = (descripcion: string) => ({
  tipo: 'servicio' as const,
  descripcion,
  cantidad: 1,
  unidad: 'un' as const,
  precio_unitario: 1000,
  descuento_pct: 0,
});

describe('generarXlsx (prueba 17)', () => {
  it('fórmulas con ROUND( y result, totales del diseño, formato #,##0 y columna Bruto oculta', async () => {
    const ws = await leer(await generarXlsx(cotizacionDePrueba(), marca));
    const total1 = ws.getCell('H10').value as ExcelJS.CellFormulaValue;
    expect(total1.formula).toContain('ROUND(');
    expect(total1.result).toBe(114000);
    expect(ws.getCell('H10').numFmt).toBe('#,##0');
    expect(ws.getCell('F10').numFmt).toBe('#,##0');
    expect(ws.getColumn(9).hidden).toBe(true);
    expect((ws.getCell('I10').value as ExcelJS.CellFormulaValue).result).toBe(114000);
    expect(totalDe(ws, 'Subtotal').result).toBe(484000);
    expect(totalDe(ws, 'Descuentos').result).toBe(9000);
    expect(totalDe(ws, 'Neto').result).toBe(475000);
    expect(totalDe(ws, 'IVA').result).toBe(90250);
    expect(totalDe(ws, 'Total').result).toBe(565250);
    expect(totalDe(ws, 'IVA').formula).toContain('IF(');
  });

  it('título, fechas dd-mm-yyyy y condiciones; BORRADOR en el título de un borrador', async () => {
    const ws = await leer(await generarXlsx(cotizacionDePrueba({ estado: 'borrador' }), marca));
    expect(ws.getCell('A1').value).toBe('Zydesk');
    expect(ws.getCell('A2').value).toBe('BORRADOR · Cotización COT-0218 v1');
    expect(ws.getCell('B3').numFmt).toBe('dd-mm-yyyy');
    expect(ws.getCell('F3').numFmt).toBe('dd-mm-yyyy');
    expect(ws.getCell('B5').value).toBe('OT-0218 · Regularización de folios');
    const textos: string[] = [];
    ws.eachRow((fila) => fila.eachCell((c) => typeof c.value === 'string' && textos.push(c.value)));
    expect(textos).toContain('Condiciones comerciales');
    expect(textos).toContain('Pago a 30 días desde la factura.');
    const definitiva = await leer(await generarXlsx(cotizacionDePrueba(), marca));
    expect(definitiva.getCell('A2').value).toBe('Cotización COT-0218 v1');
  });

  it('una descripción que empieza por =, @, - o + queda como texto, nunca como fórmula', async () => {
    const textos = ['=1+1', '@cmd', '-2+3', '+SUM(A1)'];
    const ws = await leer(
      await generarXlsx(cotizacionDePrueba({ lineas: textos.map(linea) }), marca),
    );
    for (const [i, texto] of textos.entries()) {
      const celda = ws.getCell(`C${10 + i}`);
      expect(celda.type, texto).toBe(ExcelJS.ValueType.String);
      expect((celda.value as { formula?: string }).formula).toBeUndefined();
      expect(celda.value).toBe(texto);
    }
  });

  it('texto con HTML queda literal como texto', async () => {
    const html = '<img src=x onerror=alert(1)>';
    const cot = cotizacionDePrueba({ lineas: [linea(html)], condiciones: '<b>x</b>' });
    const ws = await leer(await generarXlsx(cot, marca));
    expect(ws.getCell('C10').value).toBe(html);
    expect(ws.getCell('C10').type).toBe(ExcelJS.ValueType.String);
  });

  it('la hoja no contiene la nota interna', async () => {
    const buffer = await generarXlsx(
      cotizacionDePrueba({ nota_interna: 'NOTA-INTERNA-SECRETA-XYZ' }),
      marca,
    );
    const ws = await leer(buffer);
    const textos: string[] = [];
    ws.eachRow((fila) => fila.eachCell((c) => textos.push(String(c.value))));
    expect(textos.join('\n')).not.toContain('NOTA-INTERNA-SECRETA-XYZ');
    expect(buffer.includes('NOTA-INTERNA-SECRETA-XYZ')).toBe(false);
  });

  it('en UF: formato #,##0.00, "Valor UF" y totales con result en UF', async () => {
    const cot = cotizacionDePrueba({
      moneda: 'UF',
      valor_uf: 38000,
      lineas: [
        {
          tipo: 'servicio',
          descripcion: 'Proyecto',
          cantidad: 2.5,
          unidad: 'un',
          precio_unitario: 1.33,
          descuento_pct: 0,
        },
      ],
    });
    const ws = await leer(await generarXlsx(cot, marca));
    expect(ws.getCell('H10').numFmt).toBe('#,##0.00');
    expect((ws.getCell('H10').value as ExcelJS.CellFormulaValue).formula).toContain(',2)');
    expect(totalDe(ws, 'Neto').result).toBe(3.33);
    expect(totalDe(ws, 'Total').result).toBe(3.96);
    expect(String(ws.getCell('D6').value)).toBe(
      'Valor UF del 29 sep 2026 (Ingresado a mano): $38.000,00',
    );
  });

  it('la leyenda del valor UF usa la fecha y la fuente del indicador, también en CLP', async () => {
    const uf = cotizacionDePrueba({
      moneda: 'UF',
      valor_uf: 41098.15,
      valor_uf_fecha: '2026-10-05',
      valor_uf_fuente: 'boostr',
    });
    const wsUf = await leer(await generarXlsx(uf, marca));
    expect(wsUf.getCell('D6').value).toBe('Valor UF del 5 oct 2026 (Boostr): $41.098,15');
    const clp = cotizacionDePrueba({
      valor_uf: 41098.15,
      valor_uf_fecha: '2026-10-05',
      valor_uf_fuente: 'mindicador',
    });
    const wsClp = await leer(await generarXlsx(clp, marca));
    expect(wsClp.getCell('D6').value).toBe('Valor UF del 5 oct 2026 (mindicador.cl): $41.098,15');
    const sin = await leer(await generarXlsx(cotizacionDePrueba(), marca));
    expect(sin.getCell('D6').value).toBeNull();
  });

  it('IVA desactivado: aplica IVA FALSE e IVA con result 0', async () => {
    const ws = await leer(await generarXlsx(cotizacionDePrueba({ aplica_iva: false }), marca));
    expect(ws.getCell('B7').value).toBe(false);
    // exceljs no persiste un `result` igual a 0: al leerlo vuelve `undefined`
    expect(totalDe(ws, 'IVA').result ?? 0).toBe(0);
    expect(totalDe(ws, 'Total').result).toBe(475000);
  });

  it('sin líneas ni condiciones genera una planilla válida', async () => {
    const cot = cotizacionDePrueba({ lineas: [], condiciones: null });
    const ws = await leer(await generarXlsx(cot, marca));
    expect(totalDe(ws, 'Total').formula).toBe('H14+H15');
    expect(totalDe(ws, 'Total').result ?? 0).toBe(0);
  });
});
