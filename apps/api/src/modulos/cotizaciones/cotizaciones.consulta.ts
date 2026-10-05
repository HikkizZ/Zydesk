import { enClp, esEtapaFinal, venceEl, type EtapaOt } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { ErrorApp } from '../../core/errores/error-app.js';
import { paginar } from '../../core/http/paginacion.js';
import type {
  CotizacionResumenDatos,
  CotizacionSalidaDatos,
  CotizacionVigenteDatos,
  CotizacionesQueryDatos,
} from './cotizaciones.tipos.js';

type Consulta = Pick<EntityManager, 'query'>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

// Neto en CLP de una cotización; el redondeo de SQL coincide con `enClp` (spec fase 4 §6.1).
export const netoClpSql = (alias: string): string =>
  `(CASE ${alias}.moneda WHEN 'CLP' THEN ${alias}.neto WHEN 'UF' THEN round(${alias}.neto * ${alias}.valor_uf) END)::float8`;

const escaparLike = (s: string): string => s.replace(/[\\%_]/g, '\\$&');

const referencia = (alias: string): string =>
  `CASE WHEN ${alias}.id IS NULL THEN NULL ELSE json_build_object('id', ${alias}.id, 'nombre', ${alias}.nombre) END`;

const ES_VIGENTE = `(c.version = (SELECT max(x.version) FROM cotizacion x WHERE x.ot_id = c.ot_id))`;

// ---- Vigente de una OT (la usan cargarOt y listarOts) ----

interface FilaVigente {
  id: number;
  ot_id: number;
  codigo: string;
  version: number;
  estado: CotizacionVigenteDatos['estado'];
  moneda: CotizacionVigenteDatos['moneda'];
  neto: number;
  total: number;
  neto_clp: number | null;
  enviada_en: Date | null;
  actualizado_en: Date;
  n_versiones: number;
}

export async function cotizacionVigente(
  m: Consulta,
  ot_id: number,
): Promise<CotizacionVigenteDatos | null> {
  const [f]: FilaVigente[] = await m.query(
    `SELECT c.id, c.ot_id, c.codigo, c.version, c.estado, c.moneda, c.neto::float8 AS neto, c.total::float8 AS total,
            ${netoClpSql('c')} AS neto_clp, c.enviada_en, c.actualizado_en,
            (SELECT count(*)::int FROM cotizacion x WHERE x.ot_id = c.ot_id) AS n_versiones
       FROM cotizacion c WHERE c.ot_id = $1 ORDER BY c.version DESC LIMIT 1`,
    [ot_id],
  );
  if (!f) return null;
  return {
    id: f.id,
    ot_id: f.ot_id,
    codigo: f.codigo,
    version: f.version,
    estado: f.estado,
    moneda: f.moneda,
    neto: f.neto,
    total: f.total,
    neto_clp: f.neto_clp,
    enviada_en: iso(f.enviada_en),
    actualizado_en: f.actualizado_en.toISOString(),
    n_versiones: f.n_versiones,
  };
}

// Neto en CLP de la cotización vigente (null si no hay o falta `valor_uf`); lo usa el cierre de OT.
export async function netoVigenteClp(m: Consulta, ot_id: number): Promise<number | null> {
  const [f]: { neto_clp: number | null }[] = await m.query(
    `SELECT ${netoClpSql('c')} AS neto_clp FROM cotizacion c WHERE c.ot_id = $1 ORDER BY c.version DESC LIMIT 1`,
    [ot_id],
  );
  return f?.neto_clp ?? null;
}

// ---- Detalle ----

interface FilaCotizacion {
  id: number;
  ot_id: number;
  version: number;
  codigo: string;
  estado: CotizacionSalidaDatos['estado'];
  moneda: CotizacionSalidaDatos['moneda'];
  subtotal: number;
  descuentos: number;
  neto: number;
  iva: number;
  total: number;
  neto_clp: number | null;
  valor_uf: number | null;
  valor_uf_fecha: string | null;
  valor_uf_fuente: CotizacionSalidaDatos['valor_uf_fuente'];
  aplica_iva: boolean;
  iva_pct: number;
  fecha_emision: string;
  validez_dias: CotizacionSalidaDatos['validez_dias'];
  condiciones: string | null;
  nota_interna: string | null;
  enviada_en: Date | null;
  rechazada_en: Date | null;
  aprobada_en: Date | null;
  creado_en: Date;
  actualizado_en: Date;
  ot: { id: number; codigo: string; titulo: string; tipo: CotizacionSalidaDatos['ot']['tipo'] };
  ot_etapa: EtapaOt;
  ticket: { id: number; codigo: string };
  cliente: CotizacionSalidaDatos['cliente'];
  contacto: CotizacionSalidaDatos['contacto'];
  enviada_por: CotizacionSalidaDatos['enviada_por'];
  creado_por: CotizacionSalidaDatos['creado_por'];
  vigente: boolean;
}

export async function cargarCotizacion(m: Consulta, id: number): Promise<CotizacionSalidaDatos> {
  const [f]: FilaCotizacion[] = await m.query(
    `SELECT c.id, c.ot_id, c.version, c.codigo, c.estado, c.moneda,
            c.subtotal::float8 AS subtotal, c.descuentos::float8 AS descuentos, c.neto::float8 AS neto,
            c.iva::float8 AS iva, c.total::float8 AS total, ${netoClpSql('c')} AS neto_clp,
            c.valor_uf::float8 AS valor_uf, c.valor_uf_fecha::text AS valor_uf_fecha,
            c.valor_uf_fuente, c.aplica_iva, c.iva_pct::float8 AS iva_pct,
            c.fecha_emision::text AS fecha_emision, c.validez_dias, c.condiciones, c.nota_interna,
            c.enviada_en, c.rechazada_en, c.aprobada_en, c.creado_en, c.actualizado_en,
            json_build_object('id', o.id, 'codigo', o.codigo, 'titulo', o.titulo, 'tipo', o.tipo) AS ot,
            o.etapa AS ot_etapa,
            json_build_object('id', t.id, 'codigo', t.codigo) AS ticket,
            CASE WHEN cl.id IS NULL THEN NULL
                 ELSE json_build_object('id', cl.id, 'nombre', cl.nombre, 'es_interno', cl.es_interno) END AS cliente,
            CASE WHEN co.id IS NULL THEN NULL
                 ELSE json_build_object('id', co.id, 'nombre', co.nombre, 'correo', co.correo::text, 'area', co.area) END AS contacto,
            ${referencia('ue')} AS enviada_por, ${referencia('uc')} AS creado_por,
            ${ES_VIGENTE} AS vigente
       FROM cotizacion c
       JOIN ot o ON o.id = c.ot_id
       JOIN ticket t ON t.id = o.ticket_id
       LEFT JOIN cliente cl ON cl.id = o.cliente_id
       LEFT JOIN contacto co ON co.id = c.contacto_id
       LEFT JOIN usuario ue ON ue.id = c.enviada_por
       LEFT JOIN usuario uc ON uc.id = c.creado_por
      WHERE c.id = $1`,
    [id],
  );
  if (!f) throw new ErrorApp('NO_ENCONTRADO', 'Cotización no encontrada');

  const lineas: {
    id: number;
    orden: number;
    tipo: CotizacionSalidaDatos['lineas'][number]['tipo'];
    descripcion: string;
    cantidad: number;
    unidad: CotizacionSalidaDatos['lineas'][number]['unidad'];
    precio_unitario: number;
    descuento_pct: number;
    total: number;
  }[] = await m.query(
    `SELECT id, orden, tipo, descripcion, cantidad::float8 AS cantidad, unidad,
            precio_unitario::float8 AS precio_unitario, descuento_pct::float8 AS descuento_pct, total::float8 AS total
       FROM linea_cotizacion WHERE cotizacion_id = $1 ORDER BY orden`,
    [id],
  );
  const versiones: {
    id: number;
    version: number;
    estado: CotizacionSalidaDatos['estado'];
    total: number;
    enviada_en: Date | null;
    aprobada_en: Date | null;
  }[] = await m.query(
    `SELECT id, version, estado, total::float8 AS total, enviada_en, aprobada_en
       FROM cotizacion WHERE ot_id = $1 ORDER BY version`,
    [f.ot_id],
  );

  const otFinal = esEtapaFinal(f.ot_etapa);
  return {
    id: f.id,
    ot_id: f.ot_id,
    codigo: f.codigo,
    version: f.version,
    estado: f.estado,
    moneda: f.moneda,
    neto: f.neto,
    total: f.total,
    neto_clp: f.neto_clp,
    enviada_en: iso(f.enviada_en),
    actualizado_en: f.actualizado_en.toISOString(),
    ot: { ...f.ot, etapa: f.ot_etapa, ticket: f.ticket },
    cliente: f.cliente,
    contacto: f.contacto,
    fecha_emision: f.fecha_emision,
    validez_dias: f.validez_dias,
    vence_el: venceEl(f.fecha_emision, f.validez_dias),
    valor_uf: f.valor_uf,
    valor_uf_fecha: f.valor_uf_fecha,
    valor_uf_fuente: f.valor_uf_fuente,
    aplica_iva: f.aplica_iva,
    iva_pct: f.iva_pct,
    condiciones: f.condiciones,
    nota_interna: f.nota_interna,
    lineas,
    totales: {
      subtotal: f.subtotal,
      descuentos: f.descuentos,
      neto: f.neto,
      iva: f.iva,
      total: f.total,
    },
    total_clp: enClp(f.total, f.moneda, f.valor_uf),
    versiones: versiones.map((v) => ({
      id: v.id,
      version: v.version,
      estado: v.estado,
      total: v.total,
      enviada_en: iso(v.enviada_en),
      aprobada_en: iso(v.aprobada_en),
    })),
    vigente: f.vigente,
    editable: f.vigente && f.estado === 'borrador' && !otFinal,
    duplicable:
      f.vigente &&
      (f.estado === 'enviada' || f.estado === 'rechazada') &&
      (f.ot_etapa === 'borrador' || f.ot_etapa === 'cotizada'),
    enviada_por: f.enviada_por,
    rechazada_en: iso(f.rechazada_en),
    aprobada_en: iso(f.aprobada_en),
    creado_por: f.creado_por,
    creado_en: f.creado_en.toISOString(),
  };
}

// ---- Lista ----

interface FilaResumen {
  id: number;
  ot_id: number;
  codigo: string;
  version: number;
  estado: CotizacionResumenDatos['estado'];
  moneda: CotizacionResumenDatos['moneda'];
  neto: number;
  total: number;
  neto_clp: number | null;
  enviada_en: Date | null;
  actualizado_en: Date;
  ot: { id: number; codigo: string; titulo: string };
  ot_etapa: EtapaOt;
  cliente: CotizacionResumenDatos['cliente'];
  contacto_nombre: string | null;
  fecha_emision: string;
  validez_dias: CotizacionSalidaDatos['validez_dias'];
  vigente: boolean;
}

const FROM_LISTA = `
  FROM cotizacion c
  JOIN ot o ON o.id = c.ot_id
  LEFT JOIN cliente cl ON cl.id = o.cliente_id
  LEFT JOIN contacto co ON co.id = c.contacto_id`;

function armarWhere(q: CotizacionesQueryDatos): { where: string; valores: unknown[] } {
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
        `(o.numero = ${param(Number(texto))} OR c.codigo ILIKE ${param(`%${escaparLike(texto)}%`)})`,
      );
    } else {
      const parcial = param(`%${escaparLike(texto)}%`);
      condiciones.push(
        `(c.codigo ILIKE ${parcial} OR o.titulo ILIKE ${parcial} OR cl.nombre ILIKE ${parcial})`,
      );
    }
  }
  if (q.estado) condiciones.push(`c.estado = ANY(${param(q.estado)}::text[])`);
  if (q.cliente_id !== undefined) condiciones.push(`o.cliente_id = ${param(q.cliente_id)}`);
  if (q.ot_id !== undefined) condiciones.push(`c.ot_id = ${param(q.ot_id)}`);
  if (q.solo_vigentes === 'true') condiciones.push(ES_VIGENTE);
  return { where: condiciones.join(' AND '), valores };
}

// Nunca por `version` ni por `codigo` (ADR 0014).
const ORDENES: Record<CotizacionesQueryDatos['orden'], string> = {
  '-actualizado_en': 'c.actualizado_en DESC, c.id DESC',
  '-fecha_emision': 'c.fecha_emision DESC, c.id DESC',
};

export async function listarCotizaciones(
  m: Consulta,
  q: CotizacionesQueryDatos,
): Promise<{ datos: CotizacionResumenDatos[]; total: number; pagina: number; por_pagina: number }> {
  const { where, valores } = armarWhere(q);
  const [cuenta]: { total: number }[] = await m.query(
    `SELECT count(*)::int AS total ${FROM_LISTA} WHERE ${where}`,
    valores,
  );
  const filas: FilaResumen[] = await m.query(
    `SELECT c.id, c.ot_id, c.codigo, c.version, c.estado, c.moneda, c.neto::float8 AS neto, c.total::float8 AS total,
            ${netoClpSql('c')} AS neto_clp, c.enviada_en, c.actualizado_en,
            json_build_object('id', o.id, 'codigo', o.codigo, 'titulo', o.titulo) AS ot, o.etapa AS ot_etapa,
            CASE WHEN cl.id IS NULL THEN NULL
                 ELSE json_build_object('id', cl.id, 'nombre', cl.nombre, 'es_interno', cl.es_interno) END AS cliente,
            co.nombre AS contacto_nombre, c.fecha_emision::text AS fecha_emision, c.validez_dias,
            ${ES_VIGENTE} AS vigente
       ${FROM_LISTA}
      WHERE ${where} ORDER BY ${ORDENES[q.orden]} LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, q.por_pagina, (q.pagina - 1) * q.por_pagina],
  );
  const datos: CotizacionResumenDatos[] = filas.map((f) => ({
    id: f.id,
    ot_id: f.ot_id,
    codigo: f.codigo,
    version: f.version,
    estado: f.estado,
    moneda: f.moneda,
    neto: f.neto,
    total: f.total,
    neto_clp: f.neto_clp,
    enviada_en: iso(f.enviada_en),
    actualizado_en: f.actualizado_en.toISOString(),
    ot: { ...f.ot, etapa: f.ot_etapa },
    cliente: f.cliente,
    contacto_nombre: f.contacto_nombre,
    fecha_emision: f.fecha_emision,
    vence_el: venceEl(f.fecha_emision, f.validez_dias),
    vigente: f.vigente,
  }));
  return paginar(datos, cuenta?.total ?? 0, q);
}
