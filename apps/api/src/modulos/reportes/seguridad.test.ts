import ExcelJS from 'exceljs';
import { Writable } from 'node:stream';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  crearCliente,
  crearDepartamento,
  crearRegistroHoras,
  crearTicket,
  crearUsuario,
  ingresarComo,
  ingresarComoBot,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { crearLogger, logger as loggerGlobal } from '../../config/logger.js';
import {
  QUERY_BASE,
  descargar,
  en,
  leerLibro,
  montarEscenario,
} from '../../../test/escenario-reportes.js';

const app = () => crearApp({ comprobarBd: async () => true });

type Rol = 'admin' | 'coordinacion' | 'tecnico' | 'lectura';
async function como(rol: Rol) {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const contar = async (tabla: string): Promise<number> =>
  (await dataSource.query(`SELECT count(*)::int AS n FROM ${tabla}`))[0].n;

// Prueba 1
describe('prueba 1: sin sesión', () => {
  it('401 en ambas rutas', async () => {
    expect((await request(app()).get('/api/reportes')).status).toBe(401);
    expect((await request(app()).get('/api/reportes/exportar.xlsx')).status).toBe(401);
  });
});

// Prueba 2
describe('prueba 2: roles', () => {
  it('técnico → 403 SIN_PERMISO en ambas rutas y nada en auditoría', async () => {
    const { agente } = await como('tecnico');
    const antes = await contar('auditoria');
    for (const url of ['/api/reportes', '/api/reportes/exportar.xlsx']) {
      const r = await agente.get(url);
      expect(r.status).toBe(403);
      expect(r.body.error.codigo).toBe('SIN_PERMISO');
    }
    expect(await contar('auditoria')).toBe(antes);
  });

  it.each<Rol>(['lectura', 'coordinacion', 'admin'])(
    '%s → 200 en ambas rutas con montos numéricos',
    async (rol) => {
      const e = await montarEscenario();
      const usuario = await crearUsuario({ rol });
      const { agente } = await ingresarComo(app(), usuario);
      const r = await agente.get(`/api/reportes?${QUERY_BASE}`);
      expect(r.status).toBe(200);
      const filas = r.body.por_cliente as { nombre: string; facturado: unknown }[];
      const clinica = r.body.por_cliente.find((f: { nombre: string }) => f.nombre === 'Clínica');
      expect(clinica.facturado).toBe(250000);
      expect(typeof clinica.por_facturar).toBe('number');
      expect(filas.length).toBeGreaterThan(0);
      const x = await descargar(agente, `/api/reportes/exportar.xlsx?${QUERY_BASE}`);
      expect(x.status).toBe(200);
      expect(e.cat.id).toBeGreaterThan(0);
    },
  );

  it('sesión Bearer del bot: técnico 403, coordinación 200', async () => {
    const tecnico = await crearUsuario({ rol: 'tecnico' });
    const coord = await crearUsuario({ rol: 'coordinacion' });
    const bot1 = await ingresarComoBot(app(), tecnico);
    expect((await bot1.agente.get('/api/reportes')).status).toBe(403);
    const bot2 = await ingresarComoBot(app(), coord);
    expect((await bot2.agente.get('/api/reportes')).status).toBe(200);
  });
});

// Prueba 3
describe('prueba 3: filtros manipulados', () => {
  it.each([
    'departamento_id=0',
    'departamento_id=-1',
    'departamento_id=abc',
    'departamento_id=1e3',
    'desde=2026-13-01',
    'desde=2026-9-1',
    'cliente_id=x',
    'desde=2026-10-10&hasta=2026-10-01',
    'desde=2025-01-01&hasta=2026-01-02',
    'desde=2024-01-01',
  ])('%s → 400 VALIDACION', async (consulta) => {
    const { agente } = await como('lectura');
    const r = await agente.get(`/api/reportes?${consulta}`);
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('VALIDACION');
  });

  it('hasta < desde → VALIDACION { hasta }; usuario inexistente → { usuario_id } y no 500', async () => {
    const { agente } = await como('lectura');
    const a = await agente.get('/api/reportes?desde=2026-10-10&hasta=2026-10-01');
    expect(Object.keys(a.body.error.detalles)).toEqual(['hasta']);
    const b = await agente.get('/api/reportes?usuario_id=999999');
    expect(b.status).toBe(400);
    expect(Object.keys(b.body.error.detalles)).toEqual(['usuario_id']);
  });

  it('el borde de 366 días vale y 367 no', async () => {
    const { agente } = await como('lectura');
    expect((await agente.get('/api/reportes?desde=2025-01-01&hasta=2026-01-01')).status).toBe(200);
    expect((await agente.get('/api/reportes?desde=2025-01-01&hasta=2026-01-02')).status).toBe(400);
  });

  it('hasta futura → 200; claves desconocidas se ignoran y no aparecen en auditoría', async () => {
    const { agente } = await como('lectura');
    const f = await agente.get('/api/reportes?desde=2026-12-01&hasta=2027-01-01&sql=1&__proto__=1');
    expect(f.status).toBe(200);
    const antes = await contar('auditoria');
    const x = await descargar(
      agente,
      '/api/reportes/exportar.xlsx?desde=2026-12-01&hasta=2027-01-01&sql=1&__proto__=1&constructor=1',
    );
    expect(x.status).toBe(200);
    expect(await contar('auditoria')).toBe(antes + 1);
    const [fila]: { detalle: { filtros: string[] } }[] = await dataSource.query(
      `SELECT detalle FROM auditoria WHERE accion = 'exportacion' ORDER BY id DESC LIMIT 1`,
    );
    expect(fila!.detalle.filtros).toEqual(['desde', 'hasta']);
  });
});

// Prueba 4
describe('prueba 4: inyección', () => {
  it('cliente_id con SQL → 400 y la tabla ticket sigue existiendo', async () => {
    const { agente } = await como('lectura');
    const r = await agente.get('/api/reportes?cliente_id=1;DROP TABLE ticket');
    expect(r.status).toBe(400);
    const [t]: { existe: boolean }[] = await dataSource.query(
      `SELECT to_regclass('public.ticket') IS NOT NULL AS existe`,
    );
    expect(t!.existe).toBe(true);
  });

  it('nombres con SQL, fórmula y HTML llegan literales; en el .xlsx son texto', async () => {
    const sqlNombre = `'); DROP TABLE ticket; --`;
    const c1 = await crearCliente({ nombre: sqlNombre });
    const c2 = await crearCliente({ nombre: '=1+1' });
    await crearTicket({ cliente_id: c1.id });
    await crearTicket({ cliente_id: c2.id });
    const html = '<img src=x onerror=alert(1)>';
    await crearUsuario({ nombre: html });
    const { agente } = await como('lectura');
    const r = await agente.get('/api/reportes');
    expect(r.status).toBe(200);
    const nombres = r.body.por_cliente.map((f: { nombre: string }) => f.nombre);
    expect(nombres).toContain(sqlNombre);
    expect(nombres).toContain('=1+1');
    expect(r.body.carga.map((c: { usuario: { nombre: string } }) => c.usuario.nombre)).toContain(
      html,
    );
    const [t]: { existe: boolean }[] = await dataSource.query(
      `SELECT to_regclass('public.ticket') IS NOT NULL AS existe`,
    );
    expect(t!.existe).toBe(true);

    const x = await descargar(agente, '/api/reportes/exportar.xlsx');
    const hoja = (await leerLibro(x)).getWorksheet('Por cliente')!;
    let encontrada = false;
    hoja.eachRow((fila) => {
      const celda = fila.getCell(1);
      if (celda.value === '=1+1') {
        encontrada = true;
        expect(celda.type).toBe(ExcelJS.ValueType.String);
      }
    });
    expect(encontrada).toBe(true);
    const carga = (await leerLibro(x)).getWorksheet('Carga vs capacidad')!;
    let persona = false;
    carga.eachRow((fila) => {
      if (fila.getCell(1).value === html) persona = true;
    });
    expect(persona).toBe(true);
  });
});

// Prueba 5
describe('prueba 5: tope de filas', () => {
  // Copia una fila de ticket resuelto cerrada en el período con `generate_series` (inserción masiva por SQL).
  async function resueltosMasivos(total: number): Promise<void> {
    const plantilla = await crearTicket({
      estado: 'resuelto',
      creado_en: en('2026-09-29', '09:00'),
      cerrado_en: en('2026-09-30', '09:00'),
    });
    const columnas: { column_name: string }[] = await dataSource.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'ticket' AND table_schema = 'public' AND is_generated = 'NEVER'
          AND column_name NOT IN ('id', 'numero', 'codigo')`,
    );
    const lista = columnas.map((c) => `t."${c.column_name}"`).join(', ');
    const nombres = columnas.map((c) => `"${c.column_name}"`).join(', ');
    await dataSource.query(
      `INSERT INTO ticket (numero, codigo, ${nombres})
       SELECT 100000 + g, 'TK-' || (100000 + g), ${lista}
         FROM ticket t, generate_series(1, $2::int) g WHERE t.id = $1`,
      [plantilla.id, total - 1],
    );
  }

  it('5 001 resueltos en el período → 400 { hasta }; 5 000 → 200', async () => {
    const { agente } = await como('lectura');
    await resueltosMasivos(5001);
    const r = await agente.get(`/api/reportes?${QUERY_BASE}`);
    expect(r.status).toBe(400);
    expect(r.body.error.detalles.hasta).toEqual(['Acorta el período']);
    await dataSource.query(
      `DELETE FROM ticket WHERE id = (SELECT max(id) FROM ticket WHERE estado = 'resuelto')`,
    );
    const ok = await agente.get(`/api/reportes?${QUERY_BASE}`);
    expect(ok.status).toBe(200);
    expect(ok.body.indicadores.cerrados.resueltos).toBe(5000);
  }, 60_000);
});

// Prueba 6
describe('prueba 6: aislamiento de filtros', () => {
  it('departamento: la carga y las horas son solo de sus personas', async () => {
    const e = await montarEscenario();
    const terreno = await crearDepartamento({ nombre: 'Terreno' });
    const terr = await crearUsuario({ nombre: 'Tomás Terreno', departamento_id: terreno.id });
    await crearRegistroHoras(terr.id, { fecha: '2026-09-30', horas: 4, descripcion: 'Visita' });
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await agente.get(`/api/reportes?${QUERY_BASE}&departamento_id=${terreno.id}`);
    expect(r.status).toBe(200);
    expect(r.body.carga.map((c: { usuario: { id: number } }) => c.usuario.id)).toEqual([terr.id]);
    expect(r.body.indicadores.horas.total).toBe(4);
  });

  it('persona: un corresponsable no recibe los cierres del principal', async () => {
    const e = await montarEscenario();
    await crearTicket({
      principal_id: e.tecB.id,
      otros_ids: [e.tecA.id],
      estado: 'resuelto',
      creado_en: en('2026-09-29', '09:00'),
      cerrado_en: en('2026-09-30', '09:00'),
    });
    const { agente } = await ingresarComo(app(), e.lect);
    const a = await agente.get(`/api/reportes?${QUERY_BASE}&usuario_id=${e.tecA.id}`);
    // tecA es principal de T1, T2 y T5 (resueltos); el ticket nuevo es de tecB
    expect(a.body.indicadores.cerrados.total).toBe(3);
    const b = await agente.get(`/api/reportes?${QUERY_BASE}&usuario_id=${e.tecB.id}`);
    expect(b.body.indicadores.cerrados.total).toBe(4);
  });

  it('cliente: las horas «Sin ticket» quedan fuera y la tabla trae una sola fila', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const sin = await agente.get(`/api/reportes?${QUERY_BASE}`);
    expect(sin.body.indicadores.horas.total).toBe(10);
    const con = await agente.get(`/api/reportes?${QUERY_BASE}&cliente_id=${e.vina.id}`);
    expect(con.body.indicadores.horas.total).toBe(6.5);
    expect(con.body.por_cliente).toHaveLength(1);
  });
});

// Pruebas 7 y 8
describe('prueba 7: exportación auditada', () => {
  it('una auditoría con solo los nombres de filtros, usuario y req_id', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const antes = await contar('auditoria');
    const r = await descargar(
      agente,
      `/api/reportes/exportar.xlsx?cliente_id=${e.clinica.id}&desde=2026-09-28&zz=1`,
    );
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toMatch(
      /^attachment; filename="reportes-2026-09-28_\d{4}-\d{2}-\d{2}\.xlsx"/,
    );
    expect(await contar('auditoria')).toBe(antes + 1);
    const [fila]: {
      usuario_id: number;
      req_id: string | null;
      detalle: Record<string, unknown>;
    }[] = await dataSource.query(
      `SELECT usuario_id, req_id, detalle FROM auditoria WHERE accion = 'exportacion'`,
    );
    expect(fila!.detalle).toEqual({
      tipo: 'xlsx',
      entidad: 'reportes',
      filtros: ['cliente_id', 'desde'],
    });
    expect(JSON.stringify(fila!.detalle)).not.toContain(String(e.clinica.id));
    expect(JSON.stringify(fila!.detalle)).not.toContain('250000');
    expect(fila!.usuario_id).toBe(e.lect.id);
    expect(fila!.req_id).not.toBeNull();
    expect(fila!.req_id).toBe(r.headers['x-request-id']);
  });
});

describe('prueba 8: sin fuga por la exportación', () => {
  it('ni descripciones «Sin ticket», notas, archivos ni n.º de factura', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await descargar(agente, `/api/reportes/exportar.xlsx?${QUERY_BASE}`);
    const wb = await leerLibro(r);
    const textos: string[] = [];
    for (const hoja of wb.worksheets) {
      hoja.eachRow((fila) =>
        fila.eachCell((celda) => {
          textos.push(String(celda.value));
        }),
      );
    }
    const todo = textos.join('\n');
    expect(todo).not.toContain('Trabajo sin ticket reservado');
    expect(todo).not.toContain('F-1');
    expect(todo).not.toMatch(/Resumen de cierre|nota interna|\.pdf|\.png|\.xlsx/i);
  });

  it('el técnico recibe 403 antes de generar: la auditoría no cambia', async () => {
    const { agente } = await como('tecnico');
    const antes = await contar('auditoria');
    const r = await agente.get(`/api/reportes/exportar.xlsx?${QUERY_BASE}`);
    expect(r.status).toBe(403);
    expect(await contar('auditoria')).toBe(antes);
  });
});

// Prueba 9
describe('prueba 9: permiso antes de validar', () => {
  it('un técnico con `desde` inválido recibe 403, no 400', async () => {
    const { agente } = await como('tecnico');
    expect((await agente.get('/api/reportes?desde=basura')).status).toBe(403);
    expect((await agente.get('/api/reportes/exportar.xlsx?desde=basura')).status).toBe(403);
  });
});

// Prueba 11
describe('prueba 11: logs sin nombres ni montos', () => {
  it('solo ids y fechas', async () => {
    const lineas: string[] = [];
    const destino = new Writable({
      write(chunk, _enc, cb) {
        lineas.push(...String(chunk).split('\n').filter(Boolean));
        cb();
      },
    });
    const logger = crearLogger({
      nivel: 'debug',
      entorno: 'test',
      version: '0.0.0',
      bonito: false,
      destino,
    });
    const global: string[] = [];
    const espias = (['trace', 'debug', 'info', 'warn', 'error'] as const).map((nivel) =>
      vi.spyOn(loggerGlobal, nivel).mockImplementation(((...args: unknown[]) => {
        global.push(JSON.stringify(args));
      }) as never),
    );
    try {
      const e = await montarEscenario();
      const { agente } = await ingresarComo(
        crearApp({ comprobarBd: async () => true, logger }),
        e.lect,
      );
      expect(
        (await agente.get(`/api/reportes?${QUERY_BASE}&cliente_id=${e.clinica.id}`)).status,
      ).toBe(200);
      expect((await descargar(agente, `/api/reportes/exportar.xlsx?${QUERY_BASE}`)).status).toBe(
        200,
      );
    } finally {
      for (const espia of espias) espia.mockRestore();
    }
    const todo = [...lineas, ...global].join('\n');
    expect(global.length).toBeGreaterThan(0);
    expect(todo).toContain('reporte calculado');
    for (const secreto of ['Clínica', 'Viña', 'Transportes', 'Ana Técnica', '680000', '250000']) {
      expect(todo).not.toContain(secreto);
    }
  });
});

// Prueba 12
describe('prueba 12: X-Request-Id', () => {
  it('presente en el 400 y en el 403', async () => {
    const lectura = await como('lectura');
    const r400 = await lectura.agente.get('/api/reportes?desde=2026-10-10&hasta=2026-10-01');
    expect(r400.status).toBe(400);
    expect(r400.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const tecnico = await como('tecnico');
    const r403 = await tecnico.agente.get('/api/reportes');
    expect(r403.status).toBe(403);
    expect(r403.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
