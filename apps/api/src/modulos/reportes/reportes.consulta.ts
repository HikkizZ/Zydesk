import { jornadaSemanalHoras, type HorarioDia, type Plazo, type Prioridad } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { errorValidacion } from '../ots/ots.comun.js';
import type { FiltrosConsulta } from './reportes.tipos.js';

type Consulta = Pick<EntityManager, 'query'>;

// Consultas agregadas de solo lectura (spec fase 7 §5.3). Todo parámetro va por `$n`; los filtros opcionales
// como `$n::int IS NULL OR …`. Los límites del período son parámetros (nunca `AT TIME ZONE` sobre la columna).
export const MAX_RESUELTOS = 5000;

const ZONA_SQL = `'America/Santiago'`;

// Instante `col` dentro del período `[$d, $h]` (días calendario, ambos incluidos).
const enPeriodo = (col: string, d: number, h: number): string =>
  `${col} >= $${d}::date::timestamp AT TIME ZONE ${ZONA_SQL} AND ${col} < ($${h}::date + 1)::timestamp AT TIME ZONE ${ZONA_SQL}`;

// Atribución de un ticket (spec §4.2): su responsable principal y el departamento de este o, si no, el del
// responsable por defecto de su categoría.
const TICKET_DESDE = `
  FROM ticket t
  LEFT JOIN LATERAL (SELECT u.id AS usuario_id, u.departamento_id
                       FROM ticket_responsable r JOIN usuario u ON u.id = r.usuario_id
                      WHERE r.ticket_id = t.id AND r.principal LIMIT 1) rp ON true
  LEFT JOIN categoria cat ON cat.id = t.categoria_id
  LEFT JOIN usuario ud ON ud.id = cat.responsable_defecto_id`;

const DEPARTAMENTO_TICKET = `COALESCE(rp.departamento_id, ud.departamento_id)`;

// Filtros de departamento, persona y cliente sobre `TICKET_DESDE`, con los parámetros en `$base`, `$base+1` y `$base+2`.
const filtrosTicket = (base: number): string =>
  `($${base}::int IS NULL OR ${DEPARTAMENTO_TICKET} = $${base}::int)
   AND ($${base + 1}::int IS NULL OR rp.usuario_id = $${base + 1}::int)
   AND ($${base + 2}::int IS NULL OR t.cliente_id = $${base + 2}::int)`;

const filtrosTicketValores = (f: FiltrosConsulta): (number | null)[] => [
  f.departamento_id,
  f.usuario_id,
  f.cliente_id,
];

// Neto en CLP de la cotización vigente (misma subconsulta que `indicadoresOts`).
const NETO_VIGENTE = `
  LEFT JOIN LATERAL (
    SELECT CASE cq.moneda WHEN 'CLP' THEN cq.neto WHEN 'UF' THEN round(cq.neto * cq.valor_uf) END AS neto_clp
      FROM cotizacion cq WHERE cq.ot_id = o.id ORDER BY cq.version DESC LIMIT 1
  ) cv ON true`;

const redondear2 = (n: number): number => Math.round(n * 100) / 100;

// ---- 1. Cerrados en el período ----

export interface CerradosDatos {
  resueltos: number;
  descartados: number;
  duplicados: number;
}

export async function cerrados(m: Consulta, f: FiltrosConsulta): Promise<CerradosDatos> {
  const [fila]: CerradosDatos[] = await m.query(
    `SELECT count(*) FILTER (WHERE t.estado = 'resuelto')::int AS resueltos,
            count(*) FILTER (WHERE t.estado = 'descartado')::int AS descartados,
            count(*) FILTER (WHERE t.estado = 'duplicado')::int AS duplicados
       ${TICKET_DESDE}
      WHERE ${enPeriodo('t.cerrado_en', 1, 2)} AND ${filtrosTicket(3)}`,
    [f.desde, f.hasta, ...filtrosTicketValores(f)],
  );
  return fila!;
}

// ---- 2. Tickets resueltos del período (los únicos que se traen a memoria, por el calendario) ----

export interface ResueltoDatos {
  id: number;
  creado_en: Date;
  cerrado_en: Date;
  prioridad: Prioridad;
  fecha_limite: Date | null;
  plazo_resolucion: Record<Prioridad, Plazo> | null;
  departamento_id: number | null;
}

// Devuelve a lo sumo MAX_RESUELTOS + 1 filas: el servicio responde 400 si hay más de MAX_RESUELTOS.
export async function resueltosDelPeriodo(
  m: Consulta,
  f: FiltrosConsulta,
): Promise<ResueltoDatos[]> {
  return m.query(
    `SELECT t.id, t.creado_en, t.cerrado_en, t.prioridad, t.fecha_limite, cat.plazo_resolucion,
            ${DEPARTAMENTO_TICKET} AS departamento_id
       ${TICKET_DESDE}
      WHERE t.estado = 'resuelto' AND ${enPeriodo('t.cerrado_en', 1, 2)} AND ${filtrosTicket(3)}
      ORDER BY t.id
      LIMIT ${MAX_RESUELTOS + 1}`,
    [f.desde, f.hasta, ...filtrosTicketValores(f)],
  );
}

// ---- 3. Horas por semana ----

export interface SemanaDatos {
  semana: string;
  facturables: number;
  internas: number;
  fuera_de_horario: number;
}

// Atribución de una fila de horas (spec §4.3): quien la registró y su departamento; cliente de la OT o del ticket.
export async function horas(m: Consulta, f: FiltrosConsulta): Promise<SemanaDatos[]> {
  return m.query(
    `SELECT date_trunc('week', rh.fecha)::date::text AS semana,
            COALESCE(sum(rh.horas) FILTER (WHERE o.tipo = 'facturable'), 0)::float8 AS facturables,
            COALESCE(sum(rh.horas) FILTER (WHERE o.tipo IS DISTINCT FROM 'facturable'), 0)::float8 AS internas,
            COALESCE(sum(rh.horas) FILTER (WHERE rh.fuera_de_horario), 0)::float8 AS fuera_de_horario
       FROM registro_horas rh
       JOIN usuario u ON u.id = rh.usuario_id
       LEFT JOIN ot o ON o.id = rh.ot_id
       LEFT JOIN ticket t ON t.id = rh.ticket_id
      WHERE rh.fecha BETWEEN $1::date AND $2::date
        AND ($3::int IS NULL OR u.departamento_id = $3::int)
        AND ($4::int IS NULL OR rh.usuario_id = $4::int)
        AND ($5::int IS NULL OR COALESCE(o.cliente_id, t.cliente_id) = $5::int)
      GROUP BY 1
      ORDER BY 1`,
    [f.desde, f.hasta, f.departamento_id, f.usuario_id, f.cliente_id],
  );
}

// ---- 4. Carga vs capacidad ----

export interface CargaDatos {
  usuario_id: number;
  nombre: string;
  color_avatar: string;
  departamento_id: number | null;
  departamento_nombre: string | null;
  tickets_abiertos: number;
  horas_estimadas: number;
  capacidad_semanal: number | null;
}

type PorUsuario = { usuario_id: number; valor: number };
const mapaUsuario = (filas: PorUsuario[]): Map<number, number> =>
  new Map(filas.map((x) => [x.usuario_id, x.valor]));

// Una fila por usuario activo. Instantánea de hoy, no del período.
export async function carga(m: Consulta, f: FiltrosConsulta): Promise<CargaDatos[]> {
  const usuarios: {
    id: number;
    nombre: string;
    color_avatar: string;
    departamento_id: number | null;
    departamento_nombre: string | null;
    capacidad_tickets_pct: number | null;
  }[] = await m.query(
    `SELECT u.id, u.nombre, u.color_avatar, u.departamento_id, d.nombre AS departamento_nombre,
            d.capacidad_tickets_pct
       FROM usuario u LEFT JOIN departamento d ON d.id = u.departamento_id
      WHERE u.activo
        AND ($1::int IS NULL OR u.departamento_id = $1::int)
        AND ($2::int IS NULL OR u.id = $2::int)`,
    [f.departamento_id, f.usuario_id],
  );
  if (usuarios.length === 0) return [];
  const ids = usuarios.map((u) => u.id);

  // Tickets abiertos donde es responsable (cualquier rol).
  const abiertos: PorUsuario[] = await m.query(
    `SELECT r.usuario_id, count(DISTINCT t.id)::int AS valor
       FROM ticket_responsable r JOIN ticket t ON t.id = r.ticket_id
      WHERE t.cerrado_en IS NULL AND r.usuario_id = ANY($1::int[])
        AND ($2::int IS NULL OR t.cliente_id = $2::int)
      GROUP BY r.usuario_id`,
    [ids, f.cliente_id],
  );
  // Horas estimadas de los tickets abiertos donde es principal (así no se cuenta dos veces un ticket).
  const deTickets: PorUsuario[] = await m.query(
    `SELECT r.usuario_id, COALESCE(sum(t.horas_estimadas), 0)::float8 AS valor
       FROM ticket_responsable r JOIN ticket t ON t.id = r.ticket_id
      WHERE r.principal AND t.cerrado_en IS NULL AND r.usuario_id = ANY($1::int[])
        AND ($2::int IS NULL OR t.cliente_id = $2::int)
      GROUP BY r.usuario_id`,
    [ids, f.cliente_id],
  );
  // Horas estimadas de las tareas no hechas de OT abiertas asignadas a la persona.
  const deTareas: PorUsuario[] = await m.query(
    `SELECT ta.responsable_id AS usuario_id, COALESCE(sum(ta.horas_estimadas), 0)::float8 AS valor
       FROM tarea ta JOIN ot o ON o.id = ta.ot_id
      WHERE NOT ta.hecha AND ta.ot_id IS NOT NULL AND o.etapa NOT IN ('cerrada', 'cancelada')
        AND ta.responsable_id = ANY($1::int[])
        AND ($2::int IS NULL OR o.cliente_id = $2::int)
      GROUP BY ta.responsable_id`,
    [ids, f.cliente_id],
  );

  const deptos = [
    ...new Set(usuarios.map((u) => u.departamento_id).filter((d): d is number => d !== null)),
  ];
  const horarios: (HorarioDia & { departamento_id: number })[] =
    deptos.length === 0
      ? []
      : await m.query(
          `SELECT departamento_id, dia_semana, activo, entrada, salida, colacion_inicio, colacion_min
             FROM horario_dia WHERE departamento_id = ANY($1::int[]) ORDER BY departamento_id, dia_semana`,
          [deptos],
        );
  const jornada = new Map<number, number>(
    deptos.map((d) => [d, jornadaSemanalHoras(horarios.filter((h) => h.departamento_id === d))]),
  );

  const nAbiertos = mapaUsuario(abiertos);
  const hTickets = mapaUsuario(deTickets);
  const hTareas = mapaUsuario(deTareas);

  return usuarios.map((u) => {
    const semana = u.departamento_id === null ? null : jornada.get(u.departamento_id)!;
    return {
      usuario_id: u.id,
      nombre: u.nombre,
      color_avatar: u.color_avatar,
      departamento_id: u.departamento_id,
      departamento_nombre: u.departamento_nombre,
      tickets_abiertos: nAbiertos.get(u.id) ?? 0,
      horas_estimadas: redondear2((hTickets.get(u.id) ?? 0) + (hTareas.get(u.id) ?? 0)),
      capacidad_semanal:
        semana === null || u.capacidad_tickets_pct === null
          ? null
          : Math.round(((semana * u.capacidad_tickets_pct) / 100) * 10) / 10,
    };
  });
}

// ---- 5. Tabla por cliente ----

export interface ClienteBaseDatos {
  id: number;
  nombre: string;
  es_interno: boolean;
}

// Una clave `null` es «Sin cliente».
type PorCliente = Map<number | null, number>;

export interface ValoresClienteDatos {
  abiertos: PorCliente;
  cerrados: PorCliente;
  horas: PorCliente;
  facturado: PorCliente;
  por_facturar: PorCliente;
  clientes: ClienteBaseDatos[];
}

type FilaCliente = { cliente_id: number | null; valor: number };
const mapaCliente = (filas: FilaCliente[]): PorCliente =>
  new Map(filas.map((x) => [x.cliente_id, x.valor]));

export async function porCliente(m: Consulta, f: FiltrosConsulta): Promise<ValoresClienteDatos> {
  // Abiertos: instantánea de hoy, con los filtros de departamento, persona y cliente.
  const abiertos: FilaCliente[] = await m.query(
    `SELECT t.cliente_id, count(*)::int AS valor
       ${TICKET_DESDE}
      WHERE t.cerrado_en IS NULL AND ${filtrosTicket(1)}
      GROUP BY t.cliente_id`,
    filtrosTicketValores(f),
  );
  const cerrados: FilaCliente[] = await m.query(
    `SELECT t.cliente_id, count(*)::int AS valor
       ${TICKET_DESDE}
      WHERE ${enPeriodo('t.cerrado_en', 1, 2)} AND ${filtrosTicket(3)}
      GROUP BY t.cliente_id`,
    [f.desde, f.hasta, ...filtrosTicketValores(f)],
  );
  // Las filas «Sin ticket» no tienen cliente y quedan fuera de la tabla.
  const horasPorCliente: FilaCliente[] = await m.query(
    `SELECT COALESCE(o.cliente_id, t.cliente_id) AS cliente_id, sum(rh.horas)::float8 AS valor
       FROM registro_horas rh
       JOIN usuario u ON u.id = rh.usuario_id
       LEFT JOIN ot o ON o.id = rh.ot_id
       LEFT JOIN ticket t ON t.id = rh.ticket_id
      WHERE (rh.ticket_id IS NOT NULL OR rh.ot_id IS NOT NULL)
        AND rh.fecha BETWEEN $1::date AND $2::date
        AND ($3::int IS NULL OR u.departamento_id = $3::int)
        AND ($4::int IS NULL OR rh.usuario_id = $4::int)
        AND ($5::int IS NULL OR COALESCE(o.cliente_id, t.cliente_id) = $5::int)
      GROUP BY 1`,
    [f.desde, f.hasta, f.departamento_id, f.usuario_id, f.cliente_id],
  );
  // Montos: con filtro de departamento o persona, por el responsable técnico de la OT.
  const montos: { cliente_id: number | null; facturado: number; por_facturar: number }[] =
    await m.query(
      `SELECT o.cliente_id,
              COALESCE(sum(cv.neto_clp) FILTER (
                WHERE o.estado_facturacion = 'facturada' AND ${enPeriodo('o.facturada_en', 1, 2)}), 0)::float8 AS facturado,
              COALESCE(sum(cv.neto_clp) FILTER (WHERE o.estado_facturacion = 'por_facturar'), 0)::float8 AS por_facturar
         FROM ot o
         LEFT JOIN usuario ur ON ur.id = o.responsable_tecnico_id
         ${NETO_VIGENTE}
        WHERE o.estado_facturacion IN ('facturada', 'por_facturar')
          AND ($3::int IS NULL OR ur.departamento_id = $3::int)
          AND ($4::int IS NULL OR o.responsable_tecnico_id = $4::int)
          AND ($5::int IS NULL OR o.cliente_id = $5::int)
        GROUP BY o.cliente_id`,
      [f.desde, f.hasta, f.departamento_id, f.usuario_id, f.cliente_id],
    );
  const clientes: ClienteBaseDatos[] = await m.query(
    `SELECT id, nombre, es_interno FROM cliente ORDER BY nombre, id`,
  );
  return {
    abiertos: mapaCliente(abiertos),
    cerrados: mapaCliente(cerrados),
    horas: mapaCliente(horasPorCliente),
    facturado: new Map(montos.map((x) => [x.cliente_id, x.facturado])),
    por_facturar: new Map(montos.map((x) => [x.cliente_id, x.por_facturar])),
    clientes,
  };
}

// ---- Filtros: existencia (400 si falta; los inactivos se aceptan) ----

export interface EntidadesFiltroDatos {
  departamento: { id: number; nombre: string } | null;
  cliente: { id: number; nombre: string; es_interno: boolean } | null;
  usuario: { id: number; nombre: string; color_avatar: string } | null;
}

export async function resolverEntidades(
  m: Consulta,
  ids: { departamento_id: number | null; cliente_id: number | null; usuario_id: number | null },
): Promise<EntidadesFiltroDatos> {
  const errores: Record<string, string[]> = {};
  let departamento: EntidadesFiltroDatos['departamento'] = null;
  let cliente: EntidadesFiltroDatos['cliente'] = null;
  let usuario: EntidadesFiltroDatos['usuario'] = null;
  if (ids.departamento_id !== null) {
    const [d]: { id: number; nombre: string }[] = await m.query(
      `SELECT id, nombre FROM departamento WHERE id = $1`,
      [ids.departamento_id],
    );
    if (d) departamento = d;
    else errores['departamento_id'] = ['Departamento no encontrado'];
  }
  if (ids.cliente_id !== null) {
    const [c]: { id: number; nombre: string; es_interno: boolean }[] = await m.query(
      `SELECT id, nombre, es_interno FROM cliente WHERE id = $1`,
      [ids.cliente_id],
    );
    if (c) cliente = c;
    else errores['cliente_id'] = ['Cliente no encontrado'];
  }
  if (ids.usuario_id !== null) {
    const [u]: { id: number; nombre: string; color_avatar: string }[] = await m.query(
      `SELECT id, nombre, color_avatar FROM usuario WHERE id = $1`,
      [ids.usuario_id],
    );
    if (u) usuario = u;
    else errores['usuario_id'] = ['Persona no encontrada'];
  }
  if (Object.keys(errores).length > 0) throw errorValidacion(errores);
  return { departamento, cliente, usuario };
}
