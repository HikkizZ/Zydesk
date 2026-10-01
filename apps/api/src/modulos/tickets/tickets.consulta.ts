import { iniciales } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { ErrorApp } from '../../core/errores/error-app.js';
import { paginar } from '../../core/http/paginacion.js';
import { archivoDeId, archivosDe, archivosDeCorreo } from '../archivos/archivos.service.js';
import type {
  ClienteBreveDatos,
  TableroQueryDatos,
  TareaSalidaDatos,
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

function aResumen(f: FilaResumen): TicketResumenDatos {
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
  return paginar(filas.map(aResumen), cuenta?.total ?? 0, q);
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
  return filas.map(aResumen);
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
    ...aResumen(resumen),
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
