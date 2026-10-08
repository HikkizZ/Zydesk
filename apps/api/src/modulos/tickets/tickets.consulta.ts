import { horasHabilesEntre, horasJornada, iniciales, ZONA, type Calendario } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { ErrorApp } from '../../core/errores/error-app.js';
import { paginar } from '../../core/http/paginacion.js';
import { archivoDeId, archivosDe, archivosDeCorreo } from '../archivos/archivos.service.js';
import { cargarCalendario } from '../departamentos/departamentos.service.js';
import { hoyEnSantiago } from '../horas/horas.tipos.js';
import type {
  ClienteBreveDatos,
  LineaTiempoQueryDatos,
  LineaTiempoSalidaDatos,
  TableroQueryDatos,
  TareaSalidaDatos,
  PlazoHabilDatos,
  TicketResumenDatos,
  TicketSalidaDatos,
  TicketsQueryDatos,
} from './tickets.tipos.js';

type Consulta = Pick<EntityManager, 'query'>;

const HOY_SANTIAGO = `(now() AT TIME ZONE 'America/Santiago')::date`;

// OT vinculada (spec fase 3 §4.9): la abierta más reciente; si no hay abiertas, la cerrada más reciente;
// nunca una cancelada.
const OT_VINCULADA = `
  FROM ot o WHERE o.ticket_id = t.id AND o.etapa <> 'cancelada'
  ORDER BY (o.etapa = 'cerrada') ASC, o.creado_en DESC, o.id DESC LIMIT 1`;

// Resumen de ticket (spec §5.2): una consulta con subconsultas; `vencido`/`vence_hoy` se calculan en SQL.
const SELECT_RESUMEN = `
  SELECT t.id, t.numero, t.codigo, t.asunto, t.estado, t.espera_de, t.espera_detalle, t.prioridad,
         t.fecha_limite, t.inicio_planificado, t.motivo_cierre,
         t.creado_en, t.actualizado_en, t.cerrado_en, t.archivado_en,
         CASE WHEN c.id IS NULL THEN NULL
              ELSE json_build_object('id', c.id, 'nombre', c.nombre, 'es_interno', c.es_interno) END AS cliente,
         COALESCE((SELECT json_agg(json_build_object('id', u.id, 'nombre', u.nombre, 'color_avatar', u.color_avatar,
                                                      'principal', r.principal)
                                   ORDER BY r.principal DESC, u.nombre, u.id)
                     FROM ticket_responsable r JOIN usuario u ON u.id = r.usuario_id
                    WHERE r.ticket_id = t.id), '[]'::json) AS responsables,
         COALESCE(t.fecha_limite < now() AND t.cerrado_en IS NULL, false) AS vencido,
         COALESCE((t.fecha_limite AT TIME ZONE 'America/Santiago')::date = ${HOY_SANTIAGO}
                  AND t.cerrado_en IS NULL, false) AS vence_hoy,
         EXISTS (SELECT 1 FROM correo_adjunto ca WHERE ca.ticket_id = t.id) AS tiene_correo,
         (SELECT count(*)::int FROM mensaje m WHERE m.ticket_id = t.id) AS n_mensajes,
         CASE WHEN d.id IS NULL THEN NULL
              ELSE json_build_object('id', d.id, 'codigo', d.codigo) END AS duplicado_de,
         (SELECT json_build_object('id', o.id, 'codigo', o.codigo, 'tipo', o.tipo) ${OT_VINCULADA}) AS ot_vinculada
    FROM ticket t
    LEFT JOIN cliente c ON c.id = t.cliente_id
    LEFT JOIN ticket d ON d.id = t.duplicado_de_id`;

interface FilaResumen {
  id: number;
  numero: number;
  codigo: string;
  asunto: string;
  estado: TicketResumenDatos['estado'];
  espera_de: TicketResumenDatos['espera_de'];
  espera_detalle: string | null;
  prioridad: TicketResumenDatos['prioridad'];
  fecha_limite: Date | null;
  inicio_planificado: Date | null;
  motivo_cierre: string | null;
  creado_en: Date;
  actualizado_en: Date;
  cerrado_en: Date | null;
  archivado_en: Date | null;
  cliente: ClienteBreveDatos | null;
  responsables: { id: number; nombre: string; color_avatar: string; principal: boolean }[];
  vencido: boolean;
  vence_hoy: boolean;
  tiene_correo: boolean;
  n_mensajes: number;
  duplicado_de: { id: number; codigo: string } | null;
  ot_vinculada: TicketResumenDatos['ot_vinculada'];
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function aResumen(f: FilaResumen, plazo_habil: PlazoHabilDatos | null): TicketResumenDatos {
  return {
    id: f.id,
    numero: f.numero,
    codigo: f.codigo,
    asunto: f.asunto,
    cliente: f.cliente,
    estado: f.estado,
    espera_de: f.espera_de,
    espera_detalle: f.espera_detalle,
    prioridad: f.prioridad,
    responsables: f.responsables.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      iniciales: iniciales(r.nombre),
      color_avatar: r.color_avatar,
      principal: r.principal,
    })),
    fecha_limite: iso(f.fecha_limite),
    inicio_planificado: iso(f.inicio_planificado),
    vencido: f.vencido,
    vence_hoy: f.vence_hoy,
    plazo_habil,
    tiene_correo: f.tiene_correo,
    n_mensajes: f.n_mensajes,
    motivo_cierre: f.motivo_cierre,
    duplicado_de: f.duplicado_de,
    tipo: f.ot_vinculada ? (`ot_${f.ot_vinculada.tipo}` as const) : 'ticket',
    ot_vinculada: f.ot_vinculada,
    creado_en: f.creado_en.toISOString(),
    actualizado_en: f.actualizado_en.toISOString(),
    cerrado_en: iso(f.cerrado_en),
    archivado_en: iso(f.archivado_en),
  };
}

// ---- Plazo en horas hábiles (fase 10, §5) ----

// Calendarios ya cargados en una petición: por departamento y con los años que cubren.
export type CacheCalendarios = Map<number, { anios: Set<number>; calendario: Calendario }>;

const FORMATO_ANIO = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric' });
const anioSantiago = (d: Date): number => Number(FORMATO_ANIO.format(d));

async function calendarioDe(
  m: Consulta,
  cache: CacheCalendarios,
  departamento_id: number,
  anios: number[],
): Promise<Calendario> {
  const previo = cache.get(departamento_id);
  if (previo && anios.every((a) => previo.anios.has(a))) return previo.calendario;
  const todos = new Set([...(previo?.anios ?? []), ...anios]);
  const calendario = await cargarCalendario(m as EntityManager, departamento_id, [...todos]);
  cache.set(departamento_id, { anios: todos, calendario });
  return calendario;
}

// Calendario del ticket (ADR 0028.12): departamento del responsable principal y, si no, el del responsable
// por defecto de su categoría. Una consulta por lote.
async function departamentosDe(m: Consulta, ids: number[]): Promise<Map<number, number>> {
  const filas: { id: number; departamento_id: number | null }[] = await m.query(
    `SELECT t.id, COALESCE(rp.departamento_id, ud.departamento_id) AS departamento_id
       FROM ticket t
       LEFT JOIN LATERAL (SELECT u.departamento_id
                            FROM ticket_responsable r JOIN usuario u ON u.id = r.usuario_id
                           WHERE r.ticket_id = t.id AND r.principal LIMIT 1) rp ON true
       LEFT JOIN categoria cat ON cat.id = t.categoria_id
       LEFT JOIN usuario ud ON ud.id = cat.responsable_defecto_id
      WHERE t.id = ANY($1::int[])`,
    [ids],
  );
  const mapa = new Map<number, number>();
  for (const f of filas) if (f.departamento_id !== null) mapa.set(f.id, f.departamento_id);
  return mapa;
}

// Resúmenes con `plazo_habil`: abiertos miden hasta `ahora`; cerrados, hasta `cerrado_en` (queda congelado).
async function aResumenes(
  m: Consulta,
  filas: FilaResumen[],
  cache: CacheCalendarios = new Map(),
): Promise<TicketResumenDatos[]> {
  const ahora = new Date();
  const conPlazo = filas.filter((f) => f.fecha_limite !== null);
  const departamentos =
    conPlazo.length === 0
      ? new Map<number, number>()
      : await departamentosDe(
          m,
          conPlazo.map((f) => f.id),
        );
  const referencia = (f: FilaResumen): Date => f.cerrado_en ?? ahora;
  const aniosPorDepto = new Map<number, Set<number>>();
  for (const f of conPlazo) {
    const depto = departamentos.get(f.id);
    if (depto === undefined) continue;
    const anios = aniosPorDepto.get(depto) ?? new Set<number>();
    const desde = anioSantiago(f.inicio_planificado ?? f.creado_en);
    const hasta = Math.max(anioSantiago(f.fecha_limite!), anioSantiago(referencia(f)));
    for (let a = Math.min(desde, hasta); a <= hasta; a++) anios.add(a);
    aniosPorDepto.set(depto, anios);
  }
  const calendarios = new Map<number, Calendario>();
  for (const [depto, anios] of aniosPorDepto) {
    calendarios.set(depto, await calendarioDe(m, cache, depto, [...anios]));
  }
  return filas.map((f) => {
    const depto = departamentos.get(f.id);
    const cal = depto === undefined ? undefined : calendarios.get(depto);
    if (!f.fecha_limite || !cal) return aResumen(f, null);
    const ref = referencia(f);
    const inicio = f.inicio_planificado ?? f.creado_en;
    return aResumen(f, {
      total: horasHabilesEntre(inicio, f.fecha_limite, cal),
      restantes: horasHabilesEntre(ref, f.fecha_limite, cal),
      calculado_en: ref.toISOString(),
    });
  });
}

const escaparLike = (s: string): string => s.replace(/[\\%_]/g, '\\$&');

type FiltrosListado = Partial<
  Pick<
    TicketsQueryDatos,
    | 'q'
    | 'estado'
    | 'prioridad'
    | 'responsable_id'
    | 'solo_mios'
    | 'sin_asignar'
    | 'cliente_id'
    | 'categoria_id'
    | 'vencen_hoy'
    | 'vencidos'
    | 'con_ot'
    | 'tipo'
  >
>;

function armarWhere(
  actor_id: number,
  q: FiltrosListado,
  archivados: boolean,
): { where: string; valores: unknown[] } {
  const valores: unknown[] = [];
  const condiciones: string[] = [
    archivados ? 't.archivado_en IS NOT NULL' : 't.archivado_en IS NULL',
  ];
  const param = (v: unknown): string => {
    valores.push(v);
    return `$${valores.length}`;
  };

  if (q.q) {
    const texto = q.q;
    if (/^\d+$/.test(texto) && texto.length <= 9) {
      // ADR 0006: la búsqueda por número no depende del prefijo
      condiciones.push(
        `(t.numero = ${param(Number(texto))} OR t.codigo ILIKE ${param(escaparLike(texto))})`,
      );
    } else {
      const parcial = param(`%${escaparLike(texto)}%`);
      condiciones.push(
        `(t.asunto ILIKE ${parcial} OR t.solicitante_nombre ILIKE ${parcial} OR t.codigo ILIKE ${parcial})`,
      );
    }
  }
  if (q.estado) condiciones.push(`t.estado = ANY(${param(q.estado)}::text[])`);
  if (q.prioridad) condiciones.push(`t.prioridad = ANY(${param(q.prioridad)}::text[])`);
  if (q.responsable_id !== undefined) {
    condiciones.push(
      `EXISTS (SELECT 1 FROM ticket_responsable r WHERE r.ticket_id = t.id AND r.usuario_id = ${param(q.responsable_id)})`,
    );
  }
  if (q.solo_mios === 'true') {
    const yo = param(actor_id);
    condiciones.push(
      `(EXISTS (SELECT 1 FROM ticket_responsable r WHERE r.ticket_id = t.id AND r.usuario_id = ${yo})
        OR EXISTS (SELECT 1 FROM ticket_seguidor s WHERE s.ticket_id = t.id AND s.usuario_id = ${yo}))`,
    );
  }
  if (q.sin_asignar === 'true') {
    condiciones.push(`NOT EXISTS (SELECT 1 FROM ticket_responsable r WHERE r.ticket_id = t.id)`);
  }
  if (q.cliente_id !== undefined) condiciones.push(`t.cliente_id = ${param(q.cliente_id)}`);
  if (q.categoria_id !== undefined) condiciones.push(`t.categoria_id = ${param(q.categoria_id)}`);
  if (q.vencen_hoy === 'true') {
    condiciones.push(
      `(t.cerrado_en IS NULL AND (t.fecha_limite AT TIME ZONE 'America/Santiago')::date = ${HOY_SANTIAGO})`,
    );
  }
  if (q.vencidos === 'true') condiciones.push(`(t.cerrado_en IS NULL AND t.fecha_limite < now())`);
  if (q.con_ot !== undefined) {
    condiciones.push(
      `${q.con_ot === 'true' ? '' : 'NOT '}EXISTS (SELECT 1 FROM ot o WHERE o.ticket_id = t.id AND o.etapa <> 'cancelada')`,
    );
  }
  if (q.tipo) {
    condiciones.push(
      `COALESCE('ot_' || (SELECT o.tipo ${OT_VINCULADA}), 'ticket') = ANY(${param(q.tipo)}::text[])`,
    );
  }
  return { where: condiciones.join(' AND '), valores };
}

const ORDEN_PRIORIDAD = `CASE t.prioridad WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END`;
const ORDENES: Record<TicketsQueryDatos['orden'], string> = {
  '-actualizado_en': 't.actualizado_en DESC, t.id DESC',
  '-creado_en': 't.creado_en DESC, t.id DESC',
  fecha_limite: 't.fecha_limite ASC NULLS LAST, t.id ASC',
  prioridad: `${ORDEN_PRIORIDAD}, t.fecha_limite ASC NULLS LAST, t.id ASC`,
};

export async function listarTickets(
  m: Consulta,
  actor_id: number,
  q: TicketsQueryDatos,
): Promise<{ datos: TicketResumenDatos[]; total: number; pagina: number; por_pagina: number }> {
  const { where, valores } = armarWhere(actor_id, q, q.archivados === 'true');
  const [cuenta]: { total: number }[] = await m.query(
    `SELECT count(*)::int AS total FROM ticket t WHERE ${where}`,
    valores,
  );
  const filas: FilaResumen[] = await m.query(
    `${SELECT_RESUMEN} WHERE ${where} ORDER BY ${ORDENES[q.orden]} LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, q.por_pagina, (q.pagina - 1) * q.por_pagina],
  );
  return paginar(await aResumenes(m, filas), cuenta?.total ?? 0, q);
}

// Sin paginar: todos los no archivados que cumplan los filtros; orden fijo prioridad y -actualizado_en.
export async function listarTablero(
  m: Consulta,
  actor_id: number,
  q: TableroQueryDatos,
): Promise<TicketResumenDatos[]> {
  const { where, valores } = armarWhere(actor_id, q, false);
  const filas: FilaResumen[] = await m.query(
    `${SELECT_RESUMEN} WHERE ${where} ORDER BY ${ORDEN_PRIORIDAD}, t.actualizado_en DESC, t.id DESC`,
    valores,
  );
  return aResumenes(m, filas);
}

// ---- Detalle ----

interface FilaTarea {
  id: number;
  ticket_id: number;
  titulo: string;
  fecha: string | null;
  hecha: boolean;
  hecha_en: Date | null;
  orden: number;
  creado_en: Date;
  actualizado_en: Date;
  vencida: boolean;
  responsable_id: number | null;
  responsable_nombre: string | null;
  responsable_color: string | null;
}

function tareaSalida(t: FilaTarea): TareaSalidaDatos {
  return {
    id: t.id,
    ticket_id: t.ticket_id,
    ot_id: null,
    horas_estimadas: null,
    horas_reales: null,
    horas_registradas: 0, // tareas de ticket sin horas (spec §4.4)
    titulo: t.titulo,
    responsable:
      t.responsable_id === null
        ? null
        : {
            id: t.responsable_id,
            nombre: t.responsable_nombre ?? '',
            iniciales: iniciales(t.responsable_nombre ?? ''),
            color_avatar: t.responsable_color ?? '',
          },
    fecha: t.fecha,
    hecha: t.hecha,
    hecha_en: iso(t.hecha_en),
    orden: t.orden,
    vencida: t.vencida,
    creado_en: t.creado_en.toISOString(),
    actualizado_en: t.actualizado_en.toISOString(),
  };
}

export async function cargarTicket(m: EntityManager, id: number): Promise<TicketSalidaDatos> {
  const [resumen]: FilaResumen[] = await m.query(`${SELECT_RESUMEN} WHERE t.id = $1`, [id]);
  if (!resumen) throw new ErrorApp('NO_ENCONTRADO', 'Ticket no encontrado');
  const [extra]: {
    descripcion: string | null;
    cliente_id: number | null;
    solicitante_nombre: string | null;
    solicitante_correo: string | null;
    origen: TicketSalidaDatos['origen'];
    categoria_id: number | null;
    categoria_nombre: string | null;
    horas_estimadas: number | null;
    respuesta_limite: Date | null;
    primera_respuesta_en: Date | null;
    creado_por: number | null;
    creado_por_nombre: string | null;
  }[] = await m.query(
    `SELECT t.descripcion, t.cliente_id, t.solicitante_nombre, t.solicitante_correo::text AS solicitante_correo,
            t.origen, t.categoria_id, cat.nombre AS categoria_nombre, t.horas_estimadas::float8 AS horas_estimadas,
            t.respuesta_limite, t.primera_respuesta_en, t.creado_por, cr.nombre AS creado_por_nombre
       FROM ticket t
       LEFT JOIN categoria cat ON cat.id = t.categoria_id
       LEFT JOIN usuario cr ON cr.id = t.creado_por
      WHERE t.id = $1`,
    [id],
  );
  const seguidores: { id: number; nombre: string; color_avatar: string }[] = await m.query(
    `SELECT u.id, u.nombre, u.color_avatar FROM ticket_seguidor s JOIN usuario u ON u.id = s.usuario_id
      WHERE s.ticket_id = $1 ORDER BY u.nombre, u.id`,
    [id],
  );
  const archivos = await archivosDe(m, 'ticket', id);
  const tareas: FilaTarea[] = await m.query(
    `SELECT t.id, t.ticket_id, t.titulo, t.fecha::text AS fecha, t.hecha, t.hecha_en, t.orden, t.creado_en, t.actualizado_en,
            (t.fecha IS NOT NULL AND t.fecha < ${HOY_SANTIAGO} AND NOT t.hecha) AS vencida,
            u.id AS responsable_id, u.nombre AS responsable_nombre, u.color_avatar AS responsable_color
       FROM tarea t LEFT JOIN usuario u ON u.id = t.responsable_id
      WHERE t.ticket_id = $1 ORDER BY t.orden, t.id`,
    [id],
  );

  const ots: (Omit<TicketSalidaDatos['ots'][number], 'creado_en' | 'cerrada_en'> & {
    creado_en: Date;
    cerrada_en: Date | null;
  })[] = await m.query(
    `SELECT id, numero, codigo, titulo, tipo, etapa, estado_facturacion, resolvio_ticket, creado_en, cerrada_en
       FROM ot WHERE ticket_id = $1 ORDER BY creado_en DESC, id DESC`,
    [id],
  );

  const [correo]: {
    id: number;
    origen: 'eml' | 'msg' | 'texto';
    de: string | null;
    para: string | null;
    fecha: Date | null;
    asunto: string | null;
    cuerpo: string;
    archivo_id: number | null;
  }[] = await m.query(
    `SELECT id, origen, de, para, fecha, asunto, cuerpo, archivo_id FROM correo_adjunto WHERE ticket_id = $1`,
    [id],
  );
  let correoSalida: TicketSalidaDatos['correo'] = null;
  if (correo) {
    const original = correo.archivo_id === null ? null : await archivoDeId(m, correo.archivo_id);
    const extraidos = await archivosDeCorreo(m, correo.id);
    correoSalida = {
      id: correo.id,
      origen: correo.origen,
      de: correo.de,
      para: correo.para,
      fecha: iso(correo.fecha),
      asunto: correo.asunto,
      cuerpo: correo.cuerpo,
      archivo: original,
      adjuntos: extraidos,
    };
  }

  const e = extra!;
  return {
    ...(await aResumenes(m, [resumen]))[0]!,
    descripcion: e.descripcion,
    cliente_id: e.cliente_id,
    solicitante_nombre: e.solicitante_nombre,
    solicitante_correo: e.solicitante_correo,
    origen: e.origen,
    categoria_id: e.categoria_id,
    horas_estimadas: e.horas_estimadas,
    categoria:
      e.categoria_id === null ? null : { id: e.categoria_id, nombre: e.categoria_nombre ?? '' },
    seguidores: seguidores.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      iniciales: iniciales(s.nombre),
      color_avatar: s.color_avatar,
    })),
    respuesta_limite: iso(e.respuesta_limite),
    primera_respuesta_en: iso(e.primera_respuesta_en),
    correo: correoSalida,
    archivos,
    tareas: tareas.map(tareaSalida),
    creado_por:
      e.creado_por === null ? null : { id: e.creado_por, nombre: e.creado_por_nombre ?? '' },
    ots: ots.map((o) => ({
      id: o.id,
      numero: o.numero,
      codigo: o.codigo,
      titulo: o.titulo,
      tipo: o.tipo,
      etapa: o.etapa,
      estado_facturacion: o.estado_facturacion,
      resolvio_ticket: o.resolvio_ticket,
      creado_en: o.creado_en.toISOString(),
      cerrada_en: iso(o.cerrada_en),
    })),
  };
}

// ---- Mi día (spec fase 6 §10) ----

export type GrupoMiDia = 'vencen_hoy' | 'vencidos' | 'detenidos';

const FECHA_LIMITE_SANTIAGO = `(t.fecha_limite AT TIME ZONE 'America/Santiago')::date`;

// Tickets abiertos donde la persona es responsable (principal u otro; los seguidores no cuentan).
// `vencidos` excluye los que vencen hoy; `detenidos` (sin actividad hace más de 3 días, incluidos en espera)
// excluye los que ya están en alguno de los dos grupos de fecha.
const GRUPOS_MI_DIA: Record<GrupoMiDia, { condicion: string; orden: string }> = {
  vencen_hoy: {
    condicion: `${FECHA_LIMITE_SANTIAGO} = ${HOY_SANTIAGO}`,
    orden: 't.fecha_limite ASC, t.id ASC',
  },
  vencidos: {
    condicion: `${FECHA_LIMITE_SANTIAGO} < ${HOY_SANTIAGO}`,
    orden: 't.fecha_limite ASC, t.id ASC',
  },
  detenidos: {
    condicion: `t.actualizado_en < ((${HOY_SANTIAGO} - 3)::timestamp AT TIME ZONE 'America/Santiago')
                AND NOT (t.fecha_limite IS NOT NULL AND ${FECHA_LIMITE_SANTIAGO} <= ${HOY_SANTIAGO})`,
    orden: 't.actualizado_en ASC, t.id ASC',
  },
};

export async function listarTicketsMiDia(
  m: Consulta,
  actor_id: number,
  grupo: GrupoMiDia,
  limite: number,
  cache?: CacheCalendarios,
): Promise<{ datos: TicketResumenDatos[]; total: number }> {
  const { condicion, orden } = GRUPOS_MI_DIA[grupo];
  const where = `t.archivado_en IS NULL AND t.cerrado_en IS NULL
    AND EXISTS (SELECT 1 FROM ticket_responsable r WHERE r.ticket_id = t.id AND r.usuario_id = $1)
    AND ${condicion}`;
  const [cuenta]: { total: number }[] = await m.query(
    `SELECT count(*)::int AS total FROM ticket t WHERE ${where}`,
    [actor_id],
  );
  const filas: FilaResumen[] = await m.query(
    `${SELECT_RESUMEN} WHERE ${where} ORDER BY ${orden} LIMIT $2`,
    [actor_id, limite],
  );
  return { datos: await aResumenes(m, filas, cache), total: cuenta?.total ?? 0 };
}

// ---- Línea de tiempo (spec fase 6 §11, ADR 0016) ----

const MS_DIA = 86_400_000;
const MAX_ITEMS_LINEA = 500;

const fechaSantiago = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);

function fechasDelRango(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  for (let ms = Date.parse(desde); ms <= Date.parse(hasta); ms += MS_DIA) {
    fechas.push(new Date(ms).toISOString().slice(0, 10));
  }
  return fechas;
}

export async function lineaDeTiempo(
  m: EntityManager,
  actor_id: number,
  q: LineaTiempoQueryDatos,
): Promise<LineaTiempoSalidaDatos> {
  const fechas = fechasDelRango(q.desde, q.hasta);

  // Días hábiles del departamento de quien mira (A8); sin departamento, lunes a viernes sin feriados.
  const [yo]: { departamento_id: number | null }[] = await m.query(
    `SELECT departamento_id FROM usuario WHERE id = $1`,
    [actor_id],
  );
  const departamento_id = yo?.departamento_id ?? null;
  let cal: Calendario | null = null;
  const nombreFeriado = new Map<string, string>();
  if (departamento_id !== null) {
    const anios = [...new Set(fechas.map((f) => Number(f.slice(0, 4))))];
    cal = await cargarCalendario(m, departamento_id, anios);
    const feriados: { fecha: string; nombre: string }[] = await m.query(
      `SELECT fecha::text AS fecha, nombre FROM feriado
        WHERE fecha BETWEEN $1 AND $2 AND (departamento_id IS NULL OR departamento_id = $3::int)
        ORDER BY fecha, departamento_id NULLS LAST`,
      [q.desde, q.hasta, departamento_id],
    );
    for (const f of feriados) if (!nombreFeriado.has(f.fecha)) nombreFeriado.set(f.fecha, f.nombre);
  }
  const hoy = hoyEnSantiago();
  const dias = fechas.map((fecha) => {
    const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    return {
      fecha,
      habil: cal ? horasJornada(fecha, cal) > 0 : diaSemana >= 1 && diaSemana <= 5,
      feriado: nombreFeriado.get(fecha) ?? null,
      hoy: fecha === hoy,
    };
  });

  const inicio = `(COALESCE(t.inicio_planificado, t.creado_en) AT TIME ZONE 'America/Santiago')::date`;
  const filas: FilaResumen[] = await m.query(
    `${SELECT_RESUMEN}
      WHERE t.archivado_en IS NULL
        AND (
          ((t.cerrado_en IS NULL OR (t.cerrado_en AT TIME ZONE 'America/Santiago')::date >= $1::date)
            AND ${inicio} <= $2::date
            AND COALESCE(${FECHA_LIMITE_SANTIAGO}, ${inicio}) >= $1::date)
          OR (t.cerrado_en IS NULL AND t.fecha_limite < now())
        )
      ORDER BY COALESCE(t.fecha_limite < now() AND t.cerrado_en IS NULL, false) DESC,
               t.fecha_limite ASC NULLS LAST, t.id ASC
      LIMIT ${MAX_ITEMS_LINEA + 1}`,
    [q.desde, q.hasta],
  );
  if (filas.length > MAX_ITEMS_LINEA) {
    throw new ErrorApp('VALIDACION', 'Datos inválidos', { hasta: ['Acorta el rango'] });
  }
  const items = filas.map((f) => {
    const r = aResumen(f, null);
    return {
      id: r.id,
      codigo: r.codigo,
      asunto: r.asunto,
      estado: r.estado,
      prioridad: r.prioridad,
      inicio: fechaSantiago(f.inicio_planificado ?? f.creado_en),
      limite: f.fecha_limite ? fechaSantiago(f.fecha_limite) : null,
      vencido: r.vencido,
      cerrado: f.cerrado_en !== null,
      responsable_id: r.responsables.find((x) => x.principal)?.id ?? null,
      responsables: r.responsables,
      cliente: r.cliente,
      ot_vinculada: r.ot_vinculada,
      actualizado_en: r.actualizado_en,
    };
  });

  const personas: { id: number; nombre: string; color_avatar: string }[] = await m.query(
    `SELECT id, nombre, color_avatar FROM usuario WHERE activo ORDER BY nombre, id`,
  );
  return {
    dias,
    items,
    vencidos: items.filter((i) => i.vencido).length,
    personas: personas.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      iniciales: iniciales(p.nombre),
      color_avatar: p.color_avatar,
    })),
  };
}
