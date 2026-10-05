import {
  PRIORIDADES,
  RANGO_MAX_DIAS,
  diasHabilesEntre,
  iniciales,
  jornadaDiariaPromedio,
  lunesDe,
  type Calendario,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { hoyEnSantiago } from '../../core/fechas.js';
import { registrarAuditoria } from '../../core/historial/auditoria.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { generarXlsxReportes } from '../../integraciones/xlsx/reportes.xlsx.js';
import { cargarCalendario } from '../departamentos/departamentos.service.js';
import { obtenerMarca } from '../configuracion/configuracion.service.js';
import { errorValidacion } from '../ots/ots.comun.js';
import {
  MAX_RESUELTOS,
  carga,
  cerrados,
  horas,
  porCliente,
  resolverEntidades,
  resueltosDelPeriodo,
  type ResueltoDatos,
} from './reportes.consulta.js';
import type {
  CargaPersonaDatos,
  FilaClienteDatos,
  FiltrosConsulta,
  FiltrosReporteDatos,
  IndicadoresReporteDatos,
  ReporteSalidaDatos,
  ReportesQueryDatos,
  ResolucionPrioridadDatos,
  SemanaHorasDatos,
} from './reportes.tipos.js';

type Manager = EntityManager;

const MS_DIA = 86_400_000;

const aUtc = (f: string): number => Date.parse(`${f}T00:00:00Z`);
const sumarDias = (f: string, n: number): string =>
  new Date(aUtc(f) + n * MS_DIA).toISOString().slice(0, 10);
// Días calendario entre dos AAAA-MM-DD (sin zona).
const diasEntre = (desde: string, hasta: string): number =>
  Math.round((aUtc(hasta) - aUtc(desde)) / MS_DIA);

const redondear2 = (n: number): number => Math.round(n * 100) / 100;
const promedio = (xs: number[]): number | null =>
  xs.length === 0 ? null : redondear2(xs.reduce((s, x) => s + x, 0) / xs.length);
const pct = (parte: number, total: number): number | null =>
  total === 0 ? null : Math.round((parte / total) * 100);

export type FiltrosResueltos = FiltrosReporteDatos & FiltrosConsulta;

// Aplica los defectos (mes actual hasta hoy), vuelve a comprobar el período y resuelve los filtros (400 si no existen).
export async function resolverFiltros(
  m: Manager,
  q: ReportesQueryDatos,
): Promise<FiltrosResueltos> {
  const hoy = hoyEnSantiago();
  const desde = q.desde ?? `${hoy.slice(0, 8)}01`;
  const hasta = q.hasta ?? hoy;
  if (desde > hasta) throw errorValidacion({ hasta: ['El fin del período es anterior al inicio'] });
  if (diasEntre(desde, hasta) >= RANGO_MAX_DIAS) {
    throw errorValidacion({ hasta: ['El período no puede superar un año'] });
  }
  const ids = {
    departamento_id: q.departamento_id ?? null,
    cliente_id: q.cliente_id ?? null,
    usuario_id: q.usuario_id ?? null,
  };
  const { departamento, cliente, usuario } = await resolverEntidades(m, ids);
  return {
    desde,
    hasta,
    ...ids,
    departamento,
    cliente,
    usuario: usuario && {
      id: usuario.id,
      nombre: usuario.nombre,
      iniciales: iniciales(usuario.nombre),
      color_avatar: usuario.color_avatar,
    },
  };
}

// Resolución, plazo y objetivo (spec §4.5–§4.7): en memoria porque necesitan el calendario del departamento.
async function resolucionYPlazo(
  m: Manager,
  f: FiltrosConsulta,
): Promise<
  Pick<IndicadoresReporteDatos, 'resolucion' | 'dentro_de_plazo'> & {
    por_prioridad: ResolucionPrioridadDatos[];
  }
> {
  const filas: ResueltoDatos[] = await resueltosDelPeriodo(m, f);
  if (filas.length > MAX_RESUELTOS) {
    throw errorValidacion({ hasta: ['Acorta el período'] });
  }

  // Un calendario por departamento, con los años desde el ticket más antiguo hasta el fin del período.
  const deptos = [
    ...new Set(filas.map((x) => x.departamento_id).filter((d): d is number => d !== null)),
  ];
  const calendarios = new Map<number, Calendario>();
  if (deptos.length > 0) {
    const masAntiguo = Math.min(...filas.map((x) => x.creado_en.getTime()));
    const primero = new Date(masAntiguo - MS_DIA).getUTCFullYear();
    const ultimo = Number(f.hasta.slice(0, 4));
    const anios = Array.from({ length: ultimo - primero + 1 }, (_, i) => primero + i);
    for (const d of deptos) calendarios.set(d, await cargarCalendario(m, d, anios));
  }

  let sinCalendario = 0;
  const dias: number[] = [];
  const porPrioridad = new Map(
    PRIORIDADES.map((p) => [p, { dias: [] as number[], objetivos: [] as number[] }]),
  );
  for (const t of filas) {
    const cal = t.departamento_id === null ? undefined : calendarios.get(t.departamento_id);
    if (!cal) {
      sinCalendario += 1;
      continue;
    }
    const d = diasHabilesEntre(t.creado_en, t.cerrado_en, cal);
    dias.push(d);
    const grupo = porPrioridad.get(t.prioridad)!;
    grupo.dias.push(d);
    const plazo = t.plazo_resolucion?.[t.prioridad];
    if (plazo) {
      if (plazo.unidad === 'dias') grupo.objetivos.push(plazo.valor);
      else {
        const jornada = jornadaDiariaPromedio(cal.horario);
        if (jornada > 0) grupo.objetivos.push(plazo.valor / jornada);
      }
    }
  }

  const conPlazo = filas.filter((t) => t.fecha_limite !== null);
  const dentro = conPlazo.filter((t) => t.cerrado_en.getTime() <= t.fecha_limite!.getTime()).length;

  return {
    resolucion: { promedio_dias: promedio(dias), n: dias.length, sin_calendario: sinCalendario },
    dentro_de_plazo: { pct: pct(dentro, conPlazo.length), dentro, n: conPlazo.length },
    por_prioridad: PRIORIDADES.map((p) => {
      const g = porPrioridad.get(p)!;
      const prom = promedio(g.dias);
      const objetivo = promedio(g.objetivos);
      return {
        prioridad: p,
        n: g.dias.length,
        promedio_dias: prom,
        objetivo_dias: objetivo,
        sobre_plazo: prom !== null && objetivo !== null && prom > objetivo,
      };
    }),
  };
}

function armarCarga(filas: Awaited<ReturnType<typeof carga>>): CargaPersonaDatos[] {
  const personas: CargaPersonaDatos[] = filas.map((c) => ({
    usuario: {
      id: c.usuario_id,
      nombre: c.nombre,
      iniciales: iniciales(c.nombre),
      color_avatar: c.color_avatar,
    },
    departamento:
      c.departamento_id === null
        ? null
        : { id: c.departamento_id, nombre: c.departamento_nombre ?? '' },
    tickets_abiertos: c.tickets_abiertos,
    horas_estimadas: c.horas_estimadas,
    capacidad_semanal: c.capacidad_semanal,
    pct:
      c.capacidad_semanal === null || c.capacidad_semanal === 0
        ? null
        : Math.round((c.horas_estimadas / c.capacidad_semanal) * 100),
  }));
  // pct descendente con nulos al final, luego nombre.
  return personas.sort((a, b) => {
    if (a.pct !== b.pct) {
      if (a.pct === null) return 1;
      if (b.pct === null) return -1;
      return b.pct - a.pct;
    }
    return a.usuario.nombre.localeCompare(b.usuario.nombre, 'es');
  });
}

function armarFilasCliente(
  v: Awaited<ReturnType<typeof porCliente>>,
  clienteFiltrado: number | null,
): FilaClienteDatos[] {
  const valores = (id: number | null) => ({
    abiertos: v.abiertos.get(id) ?? 0,
    cerrados: v.cerrados.get(id) ?? 0,
    horas: redondear2(v.horas.get(id) ?? 0),
    facturado: v.facturado.get(id) ?? 0,
    por_facturar: v.por_facturar.get(id) ?? 0,
  });
  const hayValor = (x: ReturnType<typeof valores>): boolean =>
    Object.values(x).some((n) => n !== 0);

  const filas: FilaClienteDatos[] = [];
  for (const c of v.clientes.filter((x) => !x.es_interno)) {
    const x = valores(c.id);
    // Con filtro de cliente, esa fila aparece siempre.
    if (!hayValor(x) && c.id !== clienteFiltrado) continue;
    filas.push({
      cliente: { id: c.id, nombre: c.nombre, es_interno: false },
      nombre: c.nombre,
      interno: false,
      ...x,
    });
  }
  filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  // Todas las áreas internas en una sola fila, sin montos.
  const internas = v.clientes.filter((x) => x.es_interno).map((x) => valores(x.id));
  const suma = (campo: 'abiertos' | 'cerrados' | 'horas'): number =>
    internas.reduce((s, x) => s + x[campo], 0);
  const interno = {
    abiertos: suma('abiertos'),
    cerrados: suma('cerrados'),
    horas: redondear2(suma('horas')),
  };
  if (Object.values(interno).some((n) => n !== 0)) {
    filas.push({
      cliente: null,
      nombre: 'Interno',
      interno: true,
      ...interno,
      facturado: null,
      por_facturar: null,
    });
  }

  const sin = valores(null);
  if (hayValor({ ...sin, facturado: 0, por_facturar: 0 })) {
    filas.push({
      cliente: null,
      nombre: 'Sin cliente',
      interno: false,
      abiertos: sin.abiertos,
      cerrados: sin.cerrados,
      horas: sin.horas,
      facturado: null,
      por_facturar: null,
    });
  }
  return filas;
}

// Única fuente del JSON y del .xlsx. Solo `SELECT`; no abre transacción.
export async function calcularReporte(
  m: Manager,
  filtros: FiltrosResueltos,
): Promise<ReporteSalidaDatos> {
  const f: FiltrosConsulta = {
    desde: filtros.desde,
    hasta: filtros.hasta,
    departamento_id: filtros.departamento_id,
    cliente_id: filtros.cliente_id,
    usuario_id: filtros.usuario_id,
  };
  const c = await cerrados(m, f);
  const r = await resolucionYPlazo(m, f);
  const semanas = await horas(m, f);
  const cargaFilas = await carga(m, f);
  const clientes = await porCliente(m, f);

  const porSemana = new Map(semanas.map((s) => [s.semana, s]));
  const horas_por_semana: SemanaHorasDatos[] = [];
  const ultimoLunes = lunesDe(f.hasta);
  for (let lunes = lunesDe(f.desde); lunes <= ultimoLunes; lunes = sumarDias(lunes, 7)) {
    const s = porSemana.get(lunes);
    horas_por_semana.push({
      semana: lunes,
      facturables: redondear2(s?.facturables ?? 0),
      internas: redondear2(s?.internas ?? 0),
    });
  }
  const facturables = redondear2(semanas.reduce((t, s) => t + s.facturables, 0));
  const internas = redondear2(semanas.reduce((t, s) => t + s.internas, 0));
  const total = redondear2(facturables + internas);

  return {
    filtros: {
      desde: filtros.desde,
      hasta: filtros.hasta,
      departamento: filtros.departamento,
      cliente: filtros.cliente,
      usuario: filtros.usuario,
    },
    indicadores: {
      cerrados: {
        total: c.resueltos + c.descartados + c.duplicados,
        resueltos: c.resueltos,
        descartados: c.descartados,
        duplicados: c.duplicados,
      },
      resolucion: r.resolucion,
      dentro_de_plazo: r.dentro_de_plazo,
      horas: {
        total,
        facturables,
        internas,
        fuera_de_horario: redondear2(semanas.reduce((t, s) => t + s.fuera_de_horario, 0)),
        pct_facturables: pct(facturables, total),
      },
    },
    horas_por_semana,
    carga: armarCarga(cargaFilas),
    resolucion_por_prioridad: r.por_prioridad,
    por_cliente: armarFilasCliente(clientes, f.cliente_id),
  };
}

export async function obtenerReporte(
  actor: UsuarioSesion,
  q: ReportesQueryDatos,
): Promise<ReporteSalidaDatos> {
  const m = dataSource.manager;
  const filtros = await resolverFiltros(m, q);
  logger.debug(
    {
      actor_id: actor.id,
      desde: filtros.desde,
      hasta: filtros.hasta,
      departamento_id: filtros.departamento_id,
      cliente_id: filtros.cliente_id,
      usuario_id: filtros.usuario_id,
    },
    'reporte calculado',
  );
  return calcularReporte(m, filtros);
}

// `filtros`: claves de la query que existen en el esquema (sin valores). Deja `auditoria.exportacion` (ADR 0017);
// no es una entidad, así que sin `evento` ni `archivo`.
export async function exportarReporte(
  actor: UsuarioSesion,
  q: ReportesQueryDatos,
  filtros: string[],
): Promise<{ buffer: Buffer; nombre: string; tipo_mime: string }> {
  const reporte = await obtenerReporte(actor, q);
  const { nombre_app } = await obtenerMarca();
  const buffer = await generarXlsxReportes(reporte, nombre_app);
  await enTransaccion(async (tx) => {
    await registrarAuditoria(tx, {
      accion: 'exportacion',
      usuario_id: actor.id,
      detalle: { tipo: 'xlsx', entidad: 'reportes', filtros },
    });
  });
  return {
    buffer,
    nombre: `reportes-${reporte.filtros.desde}_${reporte.filtros.hasta}.xlsx`,
    tipo_mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
