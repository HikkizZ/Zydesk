import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import {
  QUERY_BASE,
  celdaDe,
  descargar,
  leerLibro,
  montarEscenario,
} from '../../../test/escenario-reportes.js';

const app = () => crearApp({ comprobarBd: async () => true });

const HOJAS = [
  'Resumen',
  'Horas por semana',
  'Carga vs capacidad',
  'Resolución por prioridad',
  'Por cliente',
];

describe('GET /api/reportes/exportar.xlsx', () => {
  it('cinco hojas con las cifras del escenario como números', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await descargar(agente, `/api/reportes/exportar.xlsx?${QUERY_BASE}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain(
      'attachment; filename="reportes-2026-09-28_2026-10-04.xlsx"',
    );
    expect(r.headers['cache-control']).toBe('no-store');
    const wb = await leerLibro(r);
    expect(wb.worksheets.map((w) => w.name)).toEqual(HOJAS);

    const resumen = wb.getWorksheet('Resumen')!;
    expect(resumen.getCell('A1').value).toBe('Período');
    expect(resumen.getCell('B1').value).toEqual(new Date('2026-09-28T12:00:00Z'));
    expect(resumen.getCell('C1').value).toEqual(new Date('2026-10-04T12:00:00Z'));
    expect(resumen.getCell('B2').value).toBe('Todos');
    expect(celdaDe(resumen, 'Tickets cerrados', 2).value).toBe(6);
    expect(celdaDe(resumen, 'Resueltos', 2).value).toBe(4);
    expect(celdaDe(resumen, 'Resolución promedio (días hábiles)', 2).value).toBe(1.5);
    expect(celdaDe(resumen, 'Resueltos dentro de plazo (%)', 2).value).toBe(75);
    expect(celdaDe(resumen, 'Horas totales', 2).value).toBe(10);
    expect(celdaDe(resumen, '% horas facturables', 2).value).toBe(50);

    const semanas = wb.getWorksheet('Horas por semana')!;
    expect(semanas.getRow(2).values).toEqual([
      undefined,
      new Date('2026-09-28T12:00:00Z'),
      5,
      5,
      10,
    ]);
    const pieSemanas = celdaDe(semanas, 'Totales', 2).value as ExcelJS.CellFormulaValue;
    expect(pieSemanas.formula).toBe('SUM(B2:B2)');
    expect(pieSemanas.result).toBe(5);

    const carga = wb.getWorksheet('Carga vs capacidad')!;
    expect(carga.getRow(2).values).toEqual([
      undefined,
      'Ana Técnica',
      'Soporte TI',
      2,
      10,
      32.8,
      30,
    ]);
    expect(carga.rowCount).toBe(5);

    const resolucion = wb.getWorksheet('Resolución por prioridad')!;
    expect(resolucion.getRow(3).values).toEqual([undefined, 'Alta', 1, 2, 1, 'Sí']);
    expect(resolucion.getRow(4).values).toEqual([undefined, 'Media', 1, 1, 2, 'No']);

    const clientes = wb.getWorksheet('Por cliente')!;
    expect(clientes.getRow(2).values).toEqual([undefined, 'Clínica', 1, 2, 0.5, 250000, 0]);
    const interno = celdaDe(clientes, 'Interno', 5);
    expect(interno.value).toBeNull();
    const pie = celdaDe(clientes, 'Totales', 5).value as ExcelJS.CellFormulaValue;
    expect(pie.formula).toBe('SUM(E2:E5)');
    expect(pie.result).toBe(250000);
    expect((celdaDe(clientes, 'Totales', 6).value as ExcelJS.CellFormulaValue).result).toBe(680000);
  });

  it('con filtros: los nombres resueltos y una sola fila de cliente', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await descargar(
      agente,
      `/api/reportes/exportar.xlsx?${QUERY_BASE}&cliente_id=${e.clinica.id}`,
    );
    const wb = await leerLibro(r);
    const resumen = wb.getWorksheet('Resumen')!;
    expect(resumen.getCell('D2').value).toBe('Clínica');
    expect(wb.getWorksheet('Por cliente')!.getRow(3).getCell(1).value).toBeNull();
  });

  it('deja exactamente una auditoría y ningún evento ni archivo', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const antes = async (tabla: string): Promise<number> =>
      (await dataSource.query(`SELECT count(*)::int AS n FROM ${tabla}`))[0].n;
    const [aud, ev, arch] = [
      await antes('auditoria'),
      await antes('evento'),
      await antes('archivo'),
    ];
    const r = await descargar(agente, `/api/reportes/exportar.xlsx?${QUERY_BASE}`);
    expect(r.status).toBe(200);
    expect(await antes('auditoria')).toBe(aud + 1);
    expect(await antes('evento')).toBe(ev);
    expect(await antes('archivo')).toBe(arch);
  });
});
