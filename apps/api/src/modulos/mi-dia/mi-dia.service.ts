import { OtsQuery, iniciales } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { hoyEnSantiago } from '../horas/horas.tipos.js';
import { listarOts } from '../ots/ots.consulta.js';
import { SQL_HORAS_REGISTRADAS } from '../tareas/tareas.service.js';
import { listarTicketsMiDia } from '../tickets/tickets.consulta.js';
import type { AvisoMiDiaDatos, MiDiaSalidaDatos, TareaMiDiaDatos } from './mi-dia.tipos.js';

const LIMITE_TICKETS = 50;
const LIMITE_DETENIDOS = 10;
const LIMITE_MENCIONES = 10;
const LIMITE_TAREAS = 20;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

interface FilaMencion {
  id: string; // bigint
  evento: AvisoMiDiaDatos['evento'];
  tipo: AvisoMiDiaDatos['tipo'];
  texto: string;
  enlace: string;
  entidad: AvisoMiDiaDatos['entidad'];
  entidad_id: number;
  datos: Record<string, unknown>;
  leido_en: Date | null;
  creado_en: Date;
  actor_id: number | null;
  actor_nombre: string | null;
  actor_color: string | null;
  telegram: AvisoMiDiaDatos['telegram'];
}

const CONDICION_MENCIONES = `a.usuario_id = $1 AND a.tipo = 'mencion' AND a.leido_en IS NULL AND a.en_app`;

async function cargarMenciones(
  m: EntityManager,
  actor_id: number,
): Promise<{ datos: AvisoMiDiaDatos[]; total: number }> {
  const [cuenta]: { total: number }[] = await m.query(
    `SELECT count(*)::int AS total FROM aviso a WHERE ${CONDICION_MENCIONES}`,
    [actor_id],
  );
  const filas: FilaMencion[] = await m.query(
    `SELECT a.id::text AS id, a.evento, a.tipo, a.texto, a.enlace, a.entidad, a.entidad_id, a.datos,
            a.leido_en, a.creado_en, u.id AS actor_id, u.nombre AS actor_nombre, u.color_avatar AS actor_color,
            (SELECT e.estado FROM aviso_envio e WHERE e.aviso_id = a.id AND e.canal = 'telegram') AS telegram
       FROM aviso a LEFT JOIN usuario u ON u.id = a.actor_id
      WHERE ${CONDICION_MENCIONES}
      ORDER BY a.creado_en DESC, a.id DESC LIMIT $2`,
    [actor_id, LIMITE_MENCIONES],
  );
  return {
    total: cuenta?.total ?? 0,
    datos: filas.map((f) => ({
      id: Number(f.id),
      evento: f.evento,
      tipo: f.tipo,
      texto: f.texto,
      enlace: f.enlace,
      entidad: f.entidad,
      entidad_id: f.entidad_id,
      datos: f.datos,
      actor:
        f.actor_id === null
          ? null
          : {
              id: f.actor_id,
              nombre: f.actor_nombre ?? '',
              iniciales: iniciales(f.actor_nombre ?? ''),
              color_avatar: f.actor_color ?? '',
            },
      leido: f.leido_en !== null,
      leido_en: iso(f.leido_en),
      creado_en: f.creado_en.toISOString(),
      telegram: f.telegram,
    })),
  };
}

interface FilaTarea {
  id: number;
  ticket_id: number | null;
  ot_id: number | null;
  titulo: string;
  fecha: string | null;
  hecha: boolean;
  hecha_en: Date | null;
  horas_estimadas: number | null;
  horas_reales: number | null;
  horas_registradas: number;
  orden: number;
  creado_en: Date;
  actualizado_en: Date;
  vencida: boolean;
  responsable_id: number;
  responsable_nombre: string;
  responsable_color: string;
  destino_tipo: 'ticket' | 'ot';
  destino_id: number;
  destino_codigo: string;
  destino_titulo: string;
}

// Abiertas, de la persona, con destino no cerrado (ticket abierto u OT que no es final).
const CONDICION_TAREAS = `t.responsable_id = $1 AND NOT t.hecha
  AND ((t.ticket_id IS NOT NULL AND tk.cerrado_en IS NULL)
    OR (t.ot_id IS NOT NULL AND o.etapa NOT IN ('cerrada','cancelada')))`;
const UNIONES_TAREAS = `FROM tarea t
  LEFT JOIN ticket tk ON tk.id = t.ticket_id
  LEFT JOIN ot o ON o.id = t.ot_id`;

async function cargarTareas(
  m: EntityManager,
  actor_id: number,
): Promise<{ datos: TareaMiDiaDatos[]; total: number }> {
  const [cuenta]: { total: number }[] = await m.query(
    `SELECT count(*)::int AS total ${UNIONES_TAREAS} WHERE ${CONDICION_TAREAS}`,
    [actor_id],
  );
  const filas: FilaTarea[] = await m.query(
    `SELECT t.id, t.ticket_id, t.ot_id, t.titulo, t.fecha::text AS fecha, t.hecha, t.hecha_en,
            t.horas_estimadas::float8 AS horas_estimadas, t.horas_reales::float8 AS horas_reales,
            ${SQL_HORAS_REGISTRADAS} AS horas_registradas, t.orden, t.creado_en, t.actualizado_en,
            (t.fecha IS NOT NULL AND t.fecha < (now() AT TIME ZONE 'America/Santiago')::date AND NOT t.hecha) AS vencida,
            u.id AS responsable_id, u.nombre AS responsable_nombre, u.color_avatar AS responsable_color,
            CASE WHEN t.ticket_id IS NOT NULL THEN 'ticket' ELSE 'ot' END AS destino_tipo,
            COALESCE(tk.id, o.id) AS destino_id, COALESCE(tk.codigo, o.codigo) AS destino_codigo,
            COALESCE(tk.asunto, o.titulo) AS destino_titulo
       ${UNIONES_TAREAS}
       JOIN usuario u ON u.id = t.responsable_id
      WHERE ${CONDICION_TAREAS}
      ORDER BY t.fecha ASC NULLS LAST, t.id ASC LIMIT $2`,
    [actor_id, LIMITE_TAREAS],
  );
  return {
    total: cuenta?.total ?? 0,
    datos: filas.map((f) => ({
      id: f.id,
      ticket_id: f.ticket_id,
      ot_id: f.ot_id,
      titulo: f.titulo,
      responsable: {
        id: f.responsable_id,
        nombre: f.responsable_nombre,
        iniciales: iniciales(f.responsable_nombre),
        color_avatar: f.responsable_color,
      },
      fecha: f.fecha,
      hecha: f.hecha,
      horas_estimadas: f.horas_estimadas,
      horas_reales: f.horas_reales,
      horas_registradas: f.horas_registradas,
      hecha_en: iso(f.hecha_en),
      orden: f.orden,
      vencida: f.vencida,
      creado_en: f.creado_en.toISOString(),
      actualizado_en: f.actualizado_en.toISOString(),
      destino: {
        tipo: f.destino_tipo,
        id: f.destino_id,
        codigo: f.destino_codigo,
        titulo: f.destino_titulo,
      },
    })),
  };
}

// Reutilizable por el resumen diario (spec fase 6 §8). Siempre sobre la persona de la sesión.
export async function cargarMiDia(
  m: EntityManager,
  actor: UsuarioSesion,
): Promise<MiDiaSalidaDatos> {
  const venHoy = await listarTicketsMiDia(m, actor.id, 'vencen_hoy', LIMITE_TICKETS);
  const vencidos = await listarTicketsMiDia(m, actor.id, 'vencidos', LIMITE_TICKETS);
  const detenidos = await listarTicketsMiDia(m, actor.id, 'detenidos', LIMITE_DETENIDOS);
  // B8: solo quien puede aprobar ve las OT internas en borrador que le tocan a él.
  const porAprobar = actor.permisos.includes('ots.aprobar')
    ? await listarOts(
        m,
        OtsQuery.parse({
          tipo: 'interna',
          etapa: 'borrador',
          aprobador_id: String(actor.id),
          por_pagina: '50',
        }),
      )
    : { datos: [], total: 0 };
  const menciones = await cargarMenciones(m, actor.id);
  const tareas = await cargarTareas(m, actor.id);

  return {
    fecha: hoyEnSantiago(),
    vencen_hoy: venHoy.datos,
    vencidos: vencidos.datos,
    por_aprobar: porAprobar.datos,
    menciones: menciones.datos,
    tareas: tareas.datos,
    detenidos: detenidos.datos,
    conteos: {
      vencen_hoy: venHoy.total,
      vencidos: vencidos.total,
      por_aprobar: porAprobar.total,
      menciones: menciones.total,
      tareas: tareas.total,
      detenidos: detenidos.total,
    },
  };
}

export function obtenerMiDia(actor: UsuarioSesion): Promise<MiDiaSalidaDatos> {
  return cargarMiDia(dataSource.manager, actor);
}
