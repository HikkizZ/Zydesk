import { iniciales, redondear, type FormaAprobacion } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { ErrorApp } from '../../core/errores/error-app.js';
import { paginar } from '../../core/http/paginacion.js';
import { archivoDeId, archivosDe } from '../archivos/archivos.service.js';
import { cotizacionVigente } from '../cotizaciones/cotizaciones.consulta.js';
import { leerTarifas } from '../configuracion/configuracion.service.js';
import type { OtResumenDatos, OtSalidaDatos, OtsQueryDatos } from './ots.tipos.js';

type Consulta = Pick<EntityManager, 'query'>;
type TareaDatos = OtSalidaDatos['tareas'][number];

const HOY_SANTIAGO = `(now() AT TIME ZONE 'America/Santiago')::date`;
const ETAPAS_FINALES = `('cerrada','cancelada')`;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

const persona = (alias: string): string =>
  `CASE WHEN ${alias}.id IS NULL THEN NULL
        ELSE json_build_object('id', ${alias}.id, 'nombre', ${alias}.nombre, 'color_avatar', ${alias}.color_avatar) END`;

// Resumen de OT (spec fase 3 §4.3): una consulta con subconsultas; `vencida` se calcula en SQL.
const SELECT_RESUMEN = `
  SELECT o.id, o.numero, o.codigo, o.titulo, o.tipo, o.etapa, o.estado_facturacion, o.resolvio_ticket,
         o.creado_en, o.cerrada_en, o.actualizado_en, o.inicio::text AS inicio, o.termino::text AS termino,
         json_build_object('id', t.id, 'codigo', t.codigo, 'asunto', t.asunto) AS ticket,
         CASE WHEN c.id IS NULL THEN NULL
              ELSE json_build_object('id', c.id, 'nombre', c.nombre, 'es_interno', c.es_interno) END AS cliente,
         ${persona('ur')} AS responsable_tecnico,
         ${persona('ua')} AS aprobador,
         cv.neto_clp::float8 AS neto,
         json_build_object(
           'estimadas', COALESCE((SELECT sum(ta.horas_estimadas) FROM tarea ta WHERE ta.ot_id = o.id), 0)::float8,
           'reales', COALESCE((SELECT sum(ta.horas_reales) FROM tarea ta WHERE ta.ot_id = o.id), 0)::float8,
           'registradas', COALESCE((SELECT sum(rh.horas) FROM registro_horas rh WHERE rh.ot_id = o.id), 0)::float8
         ) AS horas,
         (o.termino IS NOT NULL AND o.termino < ${HOY_SANTIAGO} AND o.etapa NOT IN ${ETAPAS_FINALES}) AS vencida,
         (SELECT count(*)::int FROM mensaje m WHERE m.ot_id = o.id) AS n_mensajes
    FROM ot o
    JOIN ticket t ON t.id = o.ticket_id
    LEFT JOIN cliente c ON c.id = o.cliente_id
    LEFT JOIN usuario ur ON ur.id = o.responsable_tecnico_id
    LEFT JOIN usuario ua ON ua.id = o.aprobador_id
    LEFT JOIN LATERAL (
      SELECT CASE cq.moneda WHEN 'CLP' THEN cq.neto WHEN 'UF' THEN round(cq.neto * cq.valor_uf) END AS neto_clp
        FROM cotizacion cq WHERE cq.ot_id = o.id ORDER BY cq.version DESC LIMIT 1
    ) cv ON true`;

interface PersonaFila {
  id: number;
  nombre: string;
  color_avatar: string;
}

interface FilaResumen {
  id: number;
  numero: number;
  codigo: string;
  titulo: string;
  tipo: OtResumenDatos['tipo'];
  etapa: OtResumenDatos['etapa'];
  estado_facturacion: OtResumenDatos['estado_facturacion'];
  resolvio_ticket: boolean | null;
  creado_en: Date;
  cerrada_en: Date | null;
  actualizado_en: Date;
  inicio: string | null;
  termino: string | null;
  ticket: OtResumenDatos['ticket'];
  cliente: OtResumenDatos['cliente'];
  responsable_tecnico: PersonaFila | null;
  aprobador: PersonaFila | null;
  neto: number | null;
  horas: OtResumenDatos['horas'];
  vencida: boolean;
  n_mensajes: number;
}

const aBreve = (p: PersonaFila | null): OtResumenDatos['responsable_tecnico'] =>
  p === null
    ? null
    : { id: p.id, nombre: p.nombre, iniciales: iniciales(p.nombre), color_avatar: p.color_avatar };

function aResumen(f: FilaResumen): OtResumenDatos {
  return {
    id: f.id,
    numero: f.numero,
    codigo: f.codigo,
    titulo: f.titulo,
    tipo: f.tipo,
    etapa: f.etapa,
    estado_facturacion: f.estado_facturacion,
    resolvio_ticket: f.resolvio_ticket,
    creado_en: f.creado_en.toISOString(),
    cerrada_en: iso(f.cerrada_en),
    ticket: f.ticket,
    cliente: f.cliente,
    responsable_tecnico: aBreve(f.responsable_tecnico),
    aprobador: aBreve(f.aprobador),
    neto: f.neto,
    horas: f.horas,
    inicio: f.inicio,
    termino: f.termino,
    vencida: f.vencida,
    n_mensajes: f.n_mensajes,
    actualizado_en: f.actualizado_en.toISOString(),
  };
}

const escaparLike = (s: string): string => s.replace(/[\\%_]/g, '\\$&');

function armarWhere(q: OtsQueryDatos): { where: string; valores: unknown[] } {
  const valores: unknown[] = [];
  const condiciones: string[] = ['true'];
  const param = (v: unknown): string => {
    valores.push(v);
    return `$${valores.length}`;
  };

  if (q.q) {
    const texto = q.q;
    if (/^\d+$/.test(texto) && texto.length <= 9) {
      // ADR 0006: la búsqueda por número no depende del prefijo
      condiciones.push(
        `(o.numero = ${param(Number(texto))} OR o.codigo ILIKE ${param(escaparLike(texto))})`,
      );
    } else {
      const parcial = param(`%${escaparLike(texto)}%`);
      condiciones.push(
        `(o.titulo ILIKE ${parcial} OR o.codigo ILIKE ${parcial} OR t.codigo ILIKE ${parcial} OR c.nombre ILIKE ${parcial})`,
      );
    }
  }
  if (q.ticket_id !== undefined) condiciones.push(`o.ticket_id = ${param(q.ticket_id)}`);
  if (q.cliente_id !== undefined) condiciones.push(`o.cliente_id = ${param(q.cliente_id)}`);
  if (q.tipo) condiciones.push(`o.tipo = ANY(${param(q.tipo)}::text[])`);
  if (q.etapa) condiciones.push(`o.etapa = ANY(${param(q.etapa)}::text[])`);
  if (q.estado_facturacion) {
    condiciones.push(`o.estado_facturacion = ANY(${param(q.estado_facturacion)}::text[])`);
  }
  if (q.abiertas === 'true') condiciones.push(`o.etapa NOT IN ${ETAPAS_FINALES}`);
  if (q.abiertas === 'false') condiciones.push(`o.etapa IN ${ETAPAS_FINALES}`);
  if (q.responsable_id !== undefined) {
    condiciones.push(`o.responsable_tecnico_id = ${param(q.responsable_id)}`);
  }
  if (q.aprobador_id !== undefined) condiciones.push(`o.aprobador_id = ${param(q.aprobador_id)}`);
  return { where: condiciones.join(' AND '), valores };
}

// Nunca por `numero` (ADR 0014).
const ORDENES: Record<OtsQueryDatos['orden'], string> = {
  '-actualizado_en': 'o.actualizado_en DESC, o.id DESC',
  '-creado_en': 'o.creado_en DESC, o.id DESC',
  termino: 'o.termino ASC NULLS LAST, o.id ASC',
};

export async function listarOts(
  m: Consulta,
  q: OtsQueryDatos,
): Promise<{ datos: OtResumenDatos[]; total: number; pagina: number; por_pagina: number }> {
  const { where, valores } = armarWhere(q);
  const [cuenta]: { total: number }[] = await m.query(
    `SELECT count(*)::int AS total
       FROM ot o
       JOIN ticket t ON t.id = o.ticket_id
       LEFT JOIN cliente c ON c.id = o.cliente_id
      WHERE ${where}`,
    valores,
  );
  const filas: FilaResumen[] = await m.query(
    `${SELECT_RESUMEN} WHERE ${where} ORDER BY ${ORDENES[q.orden]} LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, q.por_pagina, (q.pagina - 1) * q.por_pagina],
  );
  return paginar(filas.map(aResumen), cuenta?.total ?? 0, q);
}

// ---- Detalle ----

interface FilaTarea {
  id: number;
  ot_id: number;
  titulo: string;
  fecha: string | null;
  hecha: boolean;
  hecha_en: Date | null;
  horas_estimadas: number | null;
  horas_reales: number | null;
  orden: number;
  creado_en: Date;
  actualizado_en: Date;
  vencida: boolean;
  responsable_id: number | null;
  responsable_nombre: string | null;
  responsable_color: string | null;
}

function tareaSalida(t: FilaTarea): TareaDatos {
  return {
    id: t.id,
    ticket_id: null,
    ot_id: t.ot_id,
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
    horas_estimadas: t.horas_estimadas,
    horas_reales: t.horas_reales,
    hecha_en: iso(t.hecha_en),
    orden: t.orden,
    vencida: t.vencida,
    creado_en: t.creado_en.toISOString(),
    actualizado_en: t.actualizado_en.toISOString(),
  };
}

interface FilaExtra {
  alcance: string | null;
  cliente_id: number | null;
  contacto: { id: number; nombre: string; correo: string | null; area: string | null } | null;
  oc_cliente: string | null;
  condicion_pago: string | null;
  contrato_id: number | null;
  centro_costo: string | null;
  area_solicitante: string | null;
  aprobada_por: { id: number; nombre: string } | null;
  aprobada_en: Date | null;
  n_factura: string | null;
  facturada_en: Date | null;
  facturada_por: { id: number; nombre: string } | null;
  resumen_cierre: string | null;
  cerrada_por: { id: number; nombre: string } | null;
  motivo_cancelacion: string | null;
  cancelada_en: Date | null;
  creado_por: { id: number; nombre: string } | null;
  ticket_estado: OtSalidaDatos['ticket_origen']['estado'];
  ticket_cliente: OtSalidaDatos['cliente'];
}

const referencia = (alias: string): string =>
  `CASE WHEN ${alias}.id IS NULL THEN NULL ELSE json_build_object('id', ${alias}.id, 'nombre', ${alias}.nombre) END`;

export async function cargarOt(m: EntityManager, id: number): Promise<OtSalidaDatos> {
  const [resumen]: FilaResumen[] = await m.query(`${SELECT_RESUMEN} WHERE o.id = $1`, [id]);
  if (!resumen) throw new ErrorApp('NO_ENCONTRADO', 'OT no encontrada');

  const [extra]: FilaExtra[] = await m.query(
    `SELECT o.alcance, o.cliente_id,
            CASE WHEN co.id IS NULL THEN NULL
                 ELSE json_build_object('id', co.id, 'nombre', co.nombre, 'correo', co.correo::text, 'area', co.area) END AS contacto,
            o.oc_cliente, o.condicion_pago, o.contrato_id, o.centro_costo, o.area_solicitante,
            ${referencia('uap')} AS aprobada_por, o.aprobada_en, o.n_factura, o.facturada_en,
            ${referencia('ufa')} AS facturada_por, o.resumen_cierre, ${referencia('uce')} AS cerrada_por,
            o.motivo_cancelacion, o.cancelada_en, ${referencia('ucr')} AS creado_por,
            t.estado AS ticket_estado,
            CASE WHEN ct.id IS NULL THEN NULL
                 ELSE json_build_object('id', ct.id, 'nombre', ct.nombre, 'es_interno', ct.es_interno) END AS ticket_cliente
       FROM ot o
       JOIN ticket t ON t.id = o.ticket_id
       LEFT JOIN cliente ct ON ct.id = t.cliente_id
       LEFT JOIN contacto co ON co.id = o.contacto_id
       LEFT JOIN usuario uap ON uap.id = o.aprobada_por
       LEFT JOIN usuario ufa ON ufa.id = o.facturada_por
       LEFT JOIN usuario uce ON uce.id = o.cerrada_por
       LEFT JOIN usuario ucr ON ucr.id = o.creado_por
      WHERE o.id = $1`,
    [id],
  );
  const e = extra!;

  const tareas: FilaTarea[] = await m.query(
    `SELECT t.id, t.ot_id, t.titulo, t.fecha::text AS fecha, t.hecha, t.hecha_en,
            t.horas_estimadas::float8 AS horas_estimadas, t.horas_reales::float8 AS horas_reales,
            t.orden, t.creado_en, t.actualizado_en,
            (t.fecha IS NOT NULL AND t.fecha < ${HOY_SANTIAGO} AND NOT t.hecha) AS vencida,
            u.id AS responsable_id, u.nombre AS responsable_nombre, u.color_avatar AS responsable_color
       FROM tarea t LEFT JOIN usuario u ON u.id = t.responsable_id
      WHERE t.ot_id = $1 ORDER BY t.orden, t.id`,
    [id],
  );

  const [aprob]: {
    contacto_id: number;
    contacto_nombre: string;
    contacto_correo: string | null;
    fecha: string;
    forma: FormaAprobacion;
    archivo_id: number;
    registrada_por: { id: number; nombre: string } | null;
    registrada_en: Date;
  }[] = await m.query(
    `SELECT a.contacto_id, co.nombre AS contacto_nombre, co.correo::text AS contacto_correo, a.fecha::text AS fecha,
            a.forma, a.archivo_id, ${referencia('ur')} AS registrada_por, a.registrada_en
       FROM aprobacion_cliente a
       JOIN contacto co ON co.id = a.contacto_id
       LEFT JOIN usuario ur ON ur.id = a.registrada_por
      WHERE a.ot_id = $1`,
    [id],
  );
  let aprobacion: OtSalidaDatos['aprobacion'] = null;
  if (aprob) {
    const archivo = await archivoDeId(m, aprob.archivo_id);
    if (archivo) {
      aprobacion = {
        contacto: {
          id: aprob.contacto_id,
          nombre: aprob.contacto_nombre,
          correo: aprob.contacto_correo,
        },
        fecha: aprob.fecha,
        forma: aprob.forma,
        archivo,
        registrada_por: aprob.registrada_por,
        registrada_en: aprob.registrada_en.toISOString(),
      };
    }
  }

  // ADR 0015: horas usadas en el mes calendario actual (Santiago) por todas las OT con ese contrato.
  let bolsa: OtSalidaDatos['bolsa'] = null;
  if (e.contrato_id !== null) {
    const [b]: { horas_mes: number; usadas_mes: number }[] = await m.query(
      `SELECT cb.horas_mes::float8 AS horas_mes,
              COALESCE((SELECT sum(rh.horas) FROM registro_horas rh JOIN ot ob ON ob.id = rh.ot_id
                         WHERE ob.contrato_id = cb.id
                           AND date_trunc('month', rh.fecha) = date_trunc('month', ${HOY_SANTIAGO})), 0)::float8 AS usadas_mes
         FROM contrato_bolsa cb WHERE cb.id = $1`,
      [e.contrato_id],
    );
    if (b) bolsa = { contrato_id: e.contrato_id, horas_mes: b.horas_mes, usadas_mes: b.usadas_mes };
  }

  const responsables: (PersonaFila & { principal: boolean })[] = await m.query(
    `SELECT u.id, u.nombre, u.color_avatar, r.principal
       FROM ticket_responsable r JOIN usuario u ON u.id = r.usuario_id
      WHERE r.ticket_id = $1 ORDER BY r.principal DESC, u.nombre, u.id`,
    [resumen.ticket.id],
  );
  const seguidores: PersonaFila[] = await m.query(
    `SELECT u.id, u.nombre, u.color_avatar FROM ticket_seguidor s JOIN usuario u ON u.id = s.usuario_id
      WHERE s.ticket_id = $1 ORDER BY u.nombre, u.id`,
    [resumen.ticket.id],
  );
  const otras: { id: number; codigo: string; etapa: OtSalidaDatos['etapa'] }[] = await m.query(
    `SELECT id, codigo, etapa FROM ot
      WHERE ticket_id = $1 AND id <> $2 AND etapa NOT IN ${ETAPAS_FINALES} ORDER BY creado_en, id`,
    [resumen.ticket.id, id],
  );

  // Spec fase 4 §6.1: costo interno de una OT interna con horas registradas × tarifa de costo interno.
  let costo_interno: OtSalidaDatos['costo_interno'] = null;
  if (resumen.tipo === 'interna') {
    const { costo_interno: tarifa } = await leerTarifas(m);
    if (tarifa !== null) {
      const horas = resumen.horas.registradas;
      costo_interno = { horas, tarifa, monto: redondear(horas * tarifa, 'CLP') };
    }
  }

  return {
    ...aResumen(resumen),
    alcance: e.alcance,
    cliente_id: e.cliente_id,
    contacto: e.contacto,
    oc_cliente: e.oc_cliente,
    condicion_pago: e.condicion_pago,
    bolsa,
    centro_costo: e.centro_costo,
    area_solicitante: e.area_solicitante,
    aprobada_por: e.aprobada_por,
    aprobada_en: iso(e.aprobada_en),
    aprobacion,
    n_factura: e.n_factura,
    facturada_en: iso(e.facturada_en),
    facturada_por: e.facturada_por,
    resumen_cierre: e.resumen_cierre,
    cerrada_por: e.cerrada_por,
    motivo_cancelacion: e.motivo_cancelacion,
    cancelada_en: iso(e.cancelada_en),
    tareas: tareas.map(tareaSalida),
    archivos: await archivosDe(m, 'ot', id),
    ticket_origen: {
      id: resumen.ticket.id,
      codigo: resumen.ticket.codigo,
      asunto: resumen.ticket.asunto,
      estado: e.ticket_estado,
      cliente: e.ticket_cliente,
      responsables: responsables.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        iniciales: iniciales(r.nombre),
        color_avatar: r.color_avatar,
        principal: r.principal,
      })),
      seguidores: seguidores.map((s) => aBreve(s)!),
      otras_ots_abiertas: otras,
    },
    cotizacion: await cotizacionVigente(m, id),
    costo_interno,
    puede_cotizar:
      resumen.tipo === 'facturable' &&
      (resumen.etapa === 'borrador' || resumen.etapa === 'cotizada') &&
      resumen.cliente !== null &&
      !resumen.cliente.es_interno,
    tipo_cambiable: resumen.etapa === 'borrador',
    creado_por: e.creado_por,
  };
}
