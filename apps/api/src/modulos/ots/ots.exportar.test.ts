import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  crearCliente,
  crearCotizacion,
  crearOt,
  crearRegistroHoras,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

type Agente = Awaited<ReturnType<typeof ingresarComo>>['agente'];

const binario = (agente: Agente, url: string) =>
  agente
    .get(url)
    .buffer(true)
    .parse((res, cb) => {
      const trozos: Buffer[] = [];
      res.on('data', (t: Buffer) => trozos.push(t));
      res.on('end', () => cb(null, Buffer.concat(trozos)));
    });

async function leer(r: { body: unknown }): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.body as Buffer as unknown as ExcelJS.Buffer);
  return wb.getWorksheet('Órdenes de trabajo')!;
}

const hoySantiago = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

async function sembrar() {
  const cliente = await crearCliente({ nombre: 'Minera Andes' });
  const responsable = await crearUsuario({ nombre: 'Ana Pérez' });
  const t = await crearTicket({ cliente_id: cliente.id });
  const porFacturar = await crearOt(t.id, {
    etapa: 'cerrada',
    cliente_id: cliente.id,
    titulo: '=1+1',
    responsable_tecnico_id: responsable.id,
  });
  await crearCotizacion(porFacturar.id, {
    estado: 'aprobada',
    lineas: [{ cantidad: 1, precio_unitario: 680_000 }],
  });
  await crearRegistroHoras(responsable.id, { ot_id: porFacturar.id, horas: 2.5 });
  const facturada = await crearOt(t.id, {
    etapa: 'cerrada',
    estado_facturacion: 'facturada',
    cliente_id: cliente.id,
  });
  const pendiente = await crearOt(t.id, { etapa: 'en_ejecucion', cliente_id: cliente.id });
  return { cliente, porFacturar, facturada, pendiente };
}

describe('GET /api/ots/exportar.xlsx (spec fase 6 §12)', () => {
  it('con los filtros vigentes: una fila, Neto numérico, título como texto y totales con SUM', async () => {
    const { agente } = await como('coordinacion');
    const { porFacturar } = await sembrar();
    const r = await binario(agente, '/api/ots/exportar.xlsx?estado_facturacion=por_facturar');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(r.headers['content-disposition']).toContain(
      `attachment; filename="ots-facturacion-${hoySantiago()}.xlsx"`,
    );
    const ws = await leer(r);
    const cabecera = (ws.getRow(1).values as unknown[]).slice(1);
    expect(cabecera).toEqual([
      'OT',
      'Título',
      'Cliente',
      'Ticket',
      'Tipo',
      'Etapa',
      'Estado de facturación',
      'N° factura',
      'Cotización vigente',
      'Neto CLP',
      'Horas registradas',
      'Responsable',
      'Inicio',
      'Término',
      'Cerrada el',
    ]);
    const fila = ws.getRow(2);
    expect(fila.getCell(1).value).toBe(porFacturar.codigo);
    expect(fila.getCell(2).value).toBe('=1+1'); // texto, no fórmula
    expect(fila.getCell(3).value).toBe('Minera Andes');
    expect(fila.getCell(9).value).toBe(`COT-${porFacturar.codigo.replace(/^\D+/, '')} v1`);
    expect(fila.getCell(10).value).toBe(680_000);
    expect(fila.getCell(11).value).toBe(2.5);
    expect(fila.getCell(12).value).toBe('Ana Pérez');
    expect(ws.getRow(3).getCell(1).value).toBeNull(); // solo 1 fila de datos
    // totales al pie (fórmulas SUM con resultado)
    const totales: ExcelJS.CellFormulaValue[] = [];
    ws.eachRow((f) =>
      f.eachCell((c) => {
        const v = c.value as ExcelJS.CellFormulaValue;
        if (v && typeof v === 'object' && 'formula' in v) totales.push(v);
      }),
    );
    expect(totales.map((v) => v.formula)).toEqual(['SUM(J2:J2)', 'SUM(K2:K2)']);
    expect(totales.map((v) => v.result)).toEqual([680_000, 2.5]);
  });

  it('sin filtros incluye todas las OT', async () => {
    const { agente } = await como('admin');
    await sembrar();
    const ws = await leer(await binario(agente, '/api/ots/exportar.xlsx'));
    const codigos: unknown[] = [];
    for (let i = 2; i <= 4; i++) codigos.push(ws.getRow(i).getCell(1).value);
    expect(codigos.every((c) => typeof c === 'string' && c.startsWith('OT-'))).toBe(true);
  });

  it('tecnico y lectura → 403; coordinacion y admin → 200', async () => {
    await sembrar();
    for (const [rol, status] of [
      ['tecnico', 403],
      ['lectura', 403],
      ['coordinacion', 200],
      ['admin', 200],
    ] as const) {
      const { agente } = await como(rol);
      const r = await binario(agente, '/api/ots/exportar.xlsx');
      expect(r.status, rol).toBe(status);
    }
  });

  it('deja exactamente una auditoria exportacion { entidad: ots, filtros } y ningún evento ni archivo', async () => {
    const { agente, usuario } = await como('coordinacion');
    await sembrar();
    const eventos = async (): Promise<number> =>
      Number((await dataSource.query(`SELECT count(*)::int AS n FROM evento`))[0].n);
    const antes = await eventos();
    await binario(agente, '/api/ots/exportar.xlsx?estado_facturacion=por_facturar&q=Minera');
    const filas = await dataSource.query(
      `SELECT usuario_id, detalle FROM auditoria WHERE accion = 'exportacion'`,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].usuario_id).toBe(usuario.id);
    expect(filas[0].detalle).toEqual({
      tipo: 'xlsx',
      entidad: 'ots',
      filtros: ['estado_facturacion', 'q'],
    });
    expect(await eventos()).toBe(antes);
    expect(Number((await dataSource.query(`SELECT count(*)::int AS n FROM archivo`))[0].n)).toBe(0);
  });

  it('más de 5 000 filas → 400 VALIDACION', async () => {
    const { agente } = await como('coordinacion');
    const t = await crearTicket();
    await dataSource.query(
      `INSERT INTO ot (numero, codigo, ticket_id, tipo, etapa, titulo, estado_facturacion)
       SELECT 100000 + g, 'OT-' || (100000 + g), $1, 'interna', 'borrador', 'Masiva ' || g, 'no_aplica'
         FROM generate_series(1, 5001) g`,
      [t.id],
    );
    const r = await agente.get('/api/ots/exportar.xlsx');
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('VALIDACION');
  });

  it('sin sesión → 401', async () => {
    const r = await (await import('supertest')).default(app()).get('/api/ots/exportar.xlsx');
    expect(r.status).toBe(401);
  });
});
