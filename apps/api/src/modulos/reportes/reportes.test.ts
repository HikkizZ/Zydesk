import { describe, expect, it } from 'vitest';
import {
  crearCategoria,
  crearCliente,
  crearCotizacion,
  crearOt,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { hoyEnSantiago } from '../../core/fechas.js';
import { QUERY_BASE, en, montarEscenario } from './reportes.escenario.js';

const app = () => crearApp({ comprobarBd: async () => true });

// Valores exactos del escenario de la spec fase 7 §10.2 (consultado como Solo lectura).
async function consultar(query: string) {
  const e = await montarEscenario();
  const { agente } = await ingresarComo(app(), e.lect);
  const r = await agente.get(`/api/reportes?${query}`);
  return { e, r };
}

const resumenCliente = (nombre: string, filas: Record<string, unknown>[]) =>
  filas.find((f) => f['nombre'] === nombre);

describe('GET /api/reportes: las cifras cuadran (período base)', () => {
  it('indicadores, horas por semana y resolución por prioridad exactos', async () => {
    const { e, r } = await consultar(QUERY_BASE);
    expect(r.status).toBe(200);
    expect(r.body.filtros).toEqual({
      desde: '2026-09-28',
      hasta: '2026-10-04',
      departamento: null,
      cliente: null,
      usuario: null,
    });
    expect(r.body.indicadores.cerrados).toEqual({
      total: 6,
      resueltos: 4,
      descartados: 1,
      duplicados: 1,
    });
    expect(r.body.indicadores.resolucion).toEqual({ promedio_dias: 1.5, n: 4, sin_calendario: 0 });
    expect(r.body.indicadores.dentro_de_plazo).toEqual({ pct: 75, dentro: 3, n: 4 });
    expect(r.body.indicadores.horas).toEqual({
      total: 10,
      facturables: 5,
      internas: 5,
      fuera_de_horario: 2,
      pct_facturables: 50,
    });
    expect(r.body.horas_por_semana).toEqual([
      { semana: '2026-09-28', facturables: 5, internas: 5 },
    ]);
    expect(r.body.resolucion_por_prioridad).toEqual([
      { prioridad: 'urgente', n: 1, promedio_dias: 1, objetivo_dias: 1, sobre_plazo: false },
      { prioridad: 'alta', n: 1, promedio_dias: 2, objetivo_dias: 1, sobre_plazo: true },
      { prioridad: 'media', n: 1, promedio_dias: 1, objetivo_dias: 2, sobre_plazo: false },
      { prioridad: 'baja', n: 1, promedio_dias: 2, objetivo_dias: 3, sobre_plazo: false },
    ]);
    expect(e.tickets.t1.id).toBeGreaterThan(0);
  });

  it('carga vs capacidad: orden por % descendente y luego nombre', async () => {
    const { e, r } = await consultar(QUERY_BASE);
    const resumen = r.body.carga.map(
      (c: {
        usuario: { id: number };
        tickets_abiertos: number;
        horas_estimadas: number;
        capacidad_semanal: number;
        pct: number;
      }) => [c.usuario.id, c.tickets_abiertos, c.horas_estimadas, c.capacidad_semanal, c.pct],
    );
    expect(resumen).toEqual([
      [e.tecA.id, 2, 10, 32.8, 30],
      [e.tecB.id, 2, 4, 32.8, 12],
      [e.lect.id, 0, 0, 32.8, 0],
      [e.coord.id, 0, 0, 19.5, 0],
    ]);
    expect(r.body.carga[0].departamento).toEqual({ id: e.soporte.id, nombre: 'Soporte TI' });
    expect(r.body.carga[0].usuario.iniciales).toBe('AT');
  });

  it('tabla por cliente: externos por nombre, Interno agrupado y montos del neto vigente', async () => {
    const { r } = await consultar(QUERY_BASE);
    const filas = r.body.por_cliente as Record<string, unknown>[];
    const sinId = filas.map(({ cliente: _c, ...resto }) => resto);
    expect(sinId).toEqual([
      {
        nombre: 'Clínica',
        interno: false,
        abiertos: 1,
        cerrados: 2,
        horas: 0.5,
        facturado: 250000,
        por_facturar: 0,
      },
      {
        nombre: 'Transportes',
        interno: false,
        abiertos: 0,
        cerrados: 2,
        horas: 0,
        facturado: 0,
        por_facturar: 0,
      },
      {
        nombre: 'Viña',
        interno: false,
        abiertos: 1,
        cerrados: 2,
        horas: 6.5,
        facturado: 0,
        por_facturar: 680000,
      },
      {
        nombre: 'Interno',
        interno: true,
        abiertos: 1,
        cerrados: 0,
        horas: 2,
        facturado: null,
        por_facturar: null,
      },
    ]);
    expect(filas[3]!['cliente']).toBeNull();
    expect(resumenCliente('Clínica', filas)!['cliente']).toMatchObject({ nombre: 'Clínica' });
  });
});

describe('GET /api/reportes: variantes por filtro', () => {
  it('período ampliado a dos semanas: ceros y semanas en orden', async () => {
    const { r } = await consultar('desde=2026-09-21&hasta=2026-10-04');
    expect(r.body.horas_por_semana).toEqual([
      { semana: '2026-09-21', facturables: 2, internas: 0 },
      { semana: '2026-09-28', facturables: 5, internas: 5 },
    ]);
    expect(r.body.indicadores.horas.total).toBe(12);
    expect(r.body.indicadores.horas.pct_facturables).toBe(58);
  });

  it('departamento Coordinación: sin cierres ni horas y solo su gente en la carga', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await agente.get(`/api/reportes?${QUERY_BASE}&departamento_id=${e.coordinacion.id}`);
    expect(r.status).toBe(200);
    expect(r.body.filtros.departamento).toEqual({ id: e.coordinacion.id, nombre: 'Coordinación' });
    expect(r.body.indicadores.cerrados.total).toBe(0);
    expect(r.body.indicadores.horas.total).toBe(0);
    expect(r.body.carga.map((c: { usuario: { id: number } }) => c.usuario.id)).toEqual([
      e.coord.id,
    ]);
  });

  it('persona tecB: solo lo que tiene como principal, aunque otro sea corresponsable', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await agente.get(`/api/reportes?${QUERY_BASE}&usuario_id=${e.tecB.id}`);
    expect(r.status).toBe(200);
    expect(r.body.filtros.usuario).toMatchObject({ id: e.tecB.id, nombre: 'Bruno Técnico' });
    expect(r.body.indicadores.cerrados).toEqual({
      total: 3,
      resueltos: 1,
      descartados: 1,
      duplicados: 1,
    });
    expect(r.body.indicadores.horas.total).toBe(2.5);
    expect(r.body.carga.map((c: { usuario: { id: number } }) => c.usuario.id)).toEqual([e.tecB.id]);
  });

  it('cliente Viña: una sola fila y sin las horas «Sin ticket»', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await agente.get(`/api/reportes?${QUERY_BASE}&cliente_id=${e.vina.id}`);
    expect(r.status).toBe(200);
    expect(r.body.por_cliente).toHaveLength(1);
    expect(r.body.por_cliente[0]).toMatchObject({
      nombre: 'Viña',
      horas: 6.5,
      por_facturar: 680000,
    });
    expect(r.body.indicadores.horas.total).toBe(6.5);
  });

  it('semana anterior: T8 y su resolución de un día', async () => {
    const { r } = await consultar('desde=2026-09-14&hasta=2026-09-20');
    expect(r.body.indicadores.cerrados.total).toBe(1);
    expect(r.body.indicadores.resolucion.promedio_dias).toBe(1);
  });

  it('un resuelto sin departamento resoluble cuenta en sin_calendario y no altera el promedio', async () => {
    const e = await montarEscenario();
    const sinDepto = await crearUsuario({ rol: 'tecnico', departamento_id: null });
    const sinResponsable = await crearCategoria({ responsable_defecto_id: null });
    await crearTicket({
      categoria_id: sinResponsable.id,
      principal_id: sinDepto.id,
      estado: 'resuelto',
      creado_en: en('2026-09-29', '09:00'),
      cerrado_en: en('2026-09-30', '09:00'),
    });
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await agente.get(`/api/reportes?${QUERY_BASE}`);
    expect(r.body.indicadores.cerrados.resueltos).toBe(5);
    expect(r.body.indicadores.resolucion).toEqual({ promedio_dias: 1.5, n: 4, sin_calendario: 1 });
  });

  it('el departamento por defecto de la categoría da calendario al ticket sin principal con departamento', async () => {
    const e = await montarEscenario();
    const sinDepto = await crearUsuario({ rol: 'tecnico', departamento_id: null });
    const conDefecto = await crearCategoria({ responsable_defecto_id: e.tecA.id });
    await crearTicket({
      categoria_id: conDefecto.id,
      principal_id: sinDepto.id,
      prioridad: 'urgente',
      estado: 'resuelto',
      creado_en: en('2026-10-02', '08:30'),
      cerrado_en: en('2026-10-02', '16:30'),
    });
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await agente.get(`/api/reportes?${QUERY_BASE}`);
    expect(r.body.indicadores.resolucion).toMatchObject({ n: 5, sin_calendario: 0 });
  });

  it('plazos en horas se convierten con la jornada diaria promedio del departamento', async () => {
    const e = await montarEscenario();
    const horas = await crearCategoria({
      plazo_resolucion: {
        urgente: { valor: 8.2, unidad: 'horas' },
        alta: { valor: 1, unidad: 'dias' },
        media: { valor: 1, unidad: 'dias' },
        baja: { valor: 1, unidad: 'dias' },
      },
    });
    await crearTicket({
      categoria_id: horas.id,
      principal_id: e.tecA.id,
      prioridad: 'urgente',
      estado: 'resuelto',
      creado_en: en('2026-10-02', '08:30'),
      cerrado_en: en('2026-10-02', '16:30'),
    });
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await agente.get(`/api/reportes?${QUERY_BASE}`);
    const urgente = r.body.resolucion_por_prioridad[0];
    // objetivos: 1 d (T5) y 8,2 h / 8,2 h/día = 1 d
    expect(urgente).toMatchObject({ n: 2, objetivo_dias: 1 });
  });

  it('hasta futura: 200 con ceros', async () => {
    const { r } = await consultar('desde=2026-12-01&hasta=2027-01-01');
    expect(r.status).toBe(200);
    expect(r.body.indicadores.cerrados.total).toBe(0);
    expect(r.body.indicadores.horas).toEqual({
      total: 0,
      facturables: 0,
      internas: 0,
      fuera_de_horario: 0,
      pct_facturables: null,
    });
    expect(r.body.indicadores.resolucion.promedio_dias).toBeNull();
    expect(r.body.indicadores.dentro_de_plazo.pct).toBeNull();
    expect(r.body.horas_por_semana.length).toBeGreaterThanOrEqual(5);
    for (const s of r.body.horas_por_semana) expect(s.facturables + s.internas).toBe(0);
  });

  it('sin parámetros: el mes actual hasta hoy', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await agente.get('/api/reportes');
    expect(r.status).toBe(200);
    const hoy = hoyEnSantiago();
    expect(r.body.filtros.desde).toBe(`${hoy.slice(0, 8)}01`);
    expect(r.body.filtros.hasta).toBe(hoy);
    expect(r.body.resolucion_por_prioridad).toHaveLength(4);
  });
});

describe('GET /api/reportes: montos y filtros inexistentes', () => {
  it('«facturado» y «por facturar» usan el neto de la cotización vigente, también en UF', async () => {
    const e = await montarEscenario();
    const cliente = await crearCliente({ nombre: 'Cliente UF' });
    const t = await crearTicket({ cliente_id: cliente.id, principal_id: e.tecA.id });
    const ot = await crearOt(t.id, {
      etapa: 'cerrada',
      cliente_id: cliente.id,
      estado_facturacion: 'facturada',
      facturada_en: en('2026-10-01', '12:00'),
    });
    await crearCotizacion(ot.id, {
      estado: 'aprobada',
      moneda: 'UF',
      valor_uf: 38000,
      lineas: [{ cantidad: 1, precio_unitario: 10, unidad: 'un' }],
    });
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await agente.get(`/api/reportes?${QUERY_BASE}`);
    expect(resumenCliente('Cliente UF', r.body.por_cliente)).toMatchObject({
      facturado: 380000,
      por_facturar: 0,
    });
  });

  it('la facturación fuera del período no cuenta como facturado', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await agente.get('/api/reportes?desde=2026-10-02&hasta=2026-10-04');
    expect(resumenCliente('Clínica', r.body.por_cliente)).toMatchObject({
      facturado: 0,
      por_facturar: 0,
    });
  });

  it('con filtro de persona los montos siguen al responsable técnico de la OT', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const tecA = await agente.get(`/api/reportes?${QUERY_BASE}&usuario_id=${e.tecA.id}`);
    expect(resumenCliente('Viña', tecA.body.por_cliente)).toMatchObject({ por_facturar: 680000 });
    expect(resumenCliente('Clínica', tecA.body.por_cliente)).toBeUndefined();
    const tecB = await agente.get(`/api/reportes?${QUERY_BASE}&usuario_id=${e.tecB.id}`);
    expect(resumenCliente('Clínica', tecB.body.por_cliente)).toMatchObject({ facturado: 250000 });
  });

  it('departamento, cliente o persona inexistentes → 400 por campo; los inactivos se aceptan', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    for (const campo of ['departamento_id', 'cliente_id', 'usuario_id']) {
      const r = await agente.get(`/api/reportes?${QUERY_BASE}&${campo}=999999`);
      expect(r.status).toBe(400);
      expect(r.body.error.codigo).toBe('VALIDACION');
      expect(Object.keys(r.body.error.detalles)).toContain(campo);
    }
    const inactivo = await crearUsuario({ activo: false });
    const clienteInactivo = await crearCliente({ activo: false });
    const ok1 = await agente.get(`/api/reportes?${QUERY_BASE}&usuario_id=${inactivo.id}`);
    expect(ok1.status).toBe(200);
    expect(ok1.body.carga).toEqual([]);
    const ok2 = await agente.get(`/api/reportes?${QUERY_BASE}&cliente_id=${clienteInactivo.id}`);
    expect(ok2.status).toBe(200);
  });

  it('el tope de período también rige tras aplicar los defectos', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const r = await agente.get('/api/reportes?desde=2024-01-01');
    expect(r.status).toBe(400);
    const futuro = await agente.get('/api/reportes?desde=2099-01-01');
    expect(futuro.status).toBe(400);
  });
});
