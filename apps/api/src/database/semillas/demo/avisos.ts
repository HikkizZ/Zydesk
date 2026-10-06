import type { EntityManager } from 'typeorm';
import { construirAviso } from '../../../avisos/textos.js';
import { dataSource } from '../../../config/db.js';
import type { EventoPendiente } from '../../../core/eventos/dominio.js';
import { enTransaccion } from '../../../core/historial/transaccion.js';
import { PERSONAS } from './base.js';
import type { Personas } from './util.js';

// Avisos en la app de la demo (spec fase 9 §11.1 y §11.3): 6 a 12 por persona activa, coherentes con los tickets, OT
// y cotizaciones ya sembrados. Los textos salen de `avisos/textos.ts` (`construirAviso`), como los escribiría el
// despachador; se insertan directo (sin publicar eventos de dominio y sin `aviso_envio`: la semilla no crea vínculos de
// Telegram). Idempotente por persona: si ya tiene avisos no se toca nada.

const MAX_POR_PERSONA = 12;
const DIA = 86_400_000;

interface Candidato {
  evento: EventoPendiente;
  cuando: Date;
  mencion?: boolean;
}

interface FTicket {
  id: number;
  estado: string;
  cerrado_en: Date | null;
  creado_en: Date;
  creado_por: number | null;
  fecha_limite: Date | null;
}
interface FMencion {
  mensaje_id: number;
  usuario_id: number;
  ticket_id: number | null;
  ot_id: number | null;
  tipo: 'seguimiento' | 'nota_interna';
  autor_id: number;
  creado_en: Date;
}
interface FSeguimiento {
  id: number;
  ticket_id: number;
  autor_id: number;
  creado_en: Date;
}
interface FTarea {
  id: number;
  ticket_id: number | null;
  ot_id: number | null;
  responsable_id: number;
  creado_por: number | null;
  creado_en: Date;
}
interface FOt {
  id: number;
  tipo: 'facturable' | 'interna';
  etapa: string;
  aprobador_id: number | null;
  ticket_id: number;
  creado_en: Date;
  cerrada_en: Date | null;
  resolvio_ticket: boolean | null;
}
interface FCotizacion {
  id: number;
  ot_id: number;
  estado: string;
  aprobada_en: Date | null;
  rechazada_en: Date | null;
}
interface FPersona {
  ticket_id: number;
  usuario_id: number;
}

async function sinAvisos(usuario_id: number): Promise<boolean> {
  const [{ n }] = await dataSource.query(
    `SELECT count(*)::int AS n FROM aviso WHERE usuario_id = $1`,
    [usuario_id],
  );
  return n === 0;
}

async function insertar(
  tx: EntityManager,
  usuario_id: number,
  evento: EventoPendiente,
  cuando: Date,
  leido: boolean,
): Promise<void> {
  const plan = await construirAviso(tx, evento, cuando);
  if (!plan) return;
  await tx.query(
    `INSERT INTO aviso (usuario_id, evento, tipo, clave, texto, enlace, entidad, entidad_id, datos, actor_id, en_app,
                        leido_en, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, true, $11, $12)
     ON CONFLICT (usuario_id, clave) WHERE clave IS NOT NULL DO NOTHING`,
    [
      usuario_id,
      plan.evento,
      plan.tipo,
      plan.clave,
      plan.texto,
      plan.enlace,
      plan.entidad,
      plan.entidad_id,
      JSON.stringify(plan.datos),
      plan.actor_id,
      leido ? new Date(Math.min(cuando.getTime() + 3_600_000, Date.now() - 60_000)) : null,
      cuando,
    ],
  );
}

export async function sembrarAvisos(personas: Personas): Promise<void> {
  const q = <T>(sql: string): Promise<T[]> => dataSource.query(sql);
  const tickets = await q<FTicket>(
    `SELECT id, estado, cerrado_en, creado_en, creado_por, fecha_limite FROM ticket`,
  );
  const responsables = await q<FPersona>(`SELECT ticket_id, usuario_id FROM ticket_responsable`);
  const seguidores = await q<FPersona>(`SELECT ticket_id, usuario_id FROM ticket_seguidor`);
  const menciones = await q<FMencion>(
    `SELECT m.mensaje_id, m.usuario_id, s.ticket_id, s.ot_id, s.tipo, s.autor_id, s.creado_en
       FROM mencion m JOIN mensaje s ON s.id = m.mensaje_id`,
  );
  const seguimientos = await q<FSeguimiento>(
    `SELECT id, ticket_id, autor_id, creado_en FROM mensaje
      WHERE ticket_id IS NOT NULL AND tipo = 'seguimiento' AND copiado_desde_id IS NULL AND autor_id IS NOT NULL`,
  );
  const tareas = await q<FTarea>(
    `SELECT id, ticket_id, ot_id, responsable_id, creado_por, creado_en FROM tarea
      WHERE NOT hecha AND responsable_id IS NOT NULL`,
  );
  const ots = await q<FOt>(
    `SELECT id, tipo, etapa, aprobador_id, ticket_id, creado_en, cerrada_en, resolvio_ticket FROM ot`,
  );
  const cotizaciones = await q<FCotizacion>(
    `SELECT id, ot_id, estado, aprobada_en, rechazada_en FROM cotizacion WHERE estado IN ('aprobada', 'rechazada')`,
  );
  const ahora = Date.now();
  const tope = (d: Date): Date => new Date(Math.min(new Date(d).getTime(), ahora - 60_000));
  const en = (d: Date, minutos: number): Date => new Date(new Date(d).getTime() + minutos * 60_000);
  const abierto = (t: FTicket): boolean => t.cerrado_en === null;
  const ticketDe = (id: number): FTicket => tickets.find((t) => t.id === id)!;
  const destinatarios = (ticket_id: number): number[] => [
    ...new Set([
      ...responsables.filter((r) => r.ticket_id === ticket_id).map((r) => r.usuario_id),
      ...seguidores.filter((s) => s.ticket_id === ticket_id).map((s) => s.usuario_id),
    ]),
  ];
  // `ots.facturar` es de Administración y Coordinación (matriz de permisos)
  const puedeFacturar = new Set(
    PERSONAS.filter((x) => x.rol === 'admin' || x.rol === 'coordinacion').map((x) =>
      personas.get(x.usuario)!,
    ),
  );

  for (const persona of PERSONAS.filter((x) => x.activo !== false)) {
    const u = personas.get(persona.usuario)!;
    if (!(await sinAvisos(u))) continue;
    const c: Candidato[] = [];

    for (const t of tickets.filter(abierto)) {
      const esResp = responsables.some((r) => r.ticket_id === t.id && r.usuario_id === u);
      const esSeg = seguidores.some((s) => s.ticket_id === t.id && s.usuario_id === u);
      if (esResp && t.creado_por !== u) {
        c.push({
          evento: [
            'ticket.asignado',
            { ticket_id: t.id, usuario_ids: [u], actor_id: t.creado_por },
          ],
          cuando: en(t.creado_en, 20),
        });
      }
      if (esSeg && !esResp) {
        c.push({
          evento: [
            'ticket.seguidor_agregado',
            { ticket_id: t.id, usuario_ids: [u], actor_id: t.creado_por },
          ],
          cuando: en(t.creado_en, 25),
        });
      }
      if (esResp && t.fecha_limite) {
        const limite = new Date(t.fecha_limite);
        if (limite.getTime() < ahora) {
          c.push({
            evento: ['ticket.vencio', { ticket_id: t.id, fecha_limite: limite.toISOString() }],
            cuando: en(limite, 60),
          });
        } else if (limite.getTime() - ahora < 2 * DIA) {
          c.push({
            evento: [
              'ticket.vence_pronto',
              { ticket_id: t.id, fecha_limite: limite.toISOString() },
            ],
            cuando: en(limite, -15 * 60),
          });
        }
      }
      if ((esResp || esSeg) && t.estado === 'en_espera' && t.creado_por !== u) {
        c.push({
          evento: [
            'ticket.estado_cambiado',
            {
              ticket_id: t.id,
              estado_anterior: 'en_curso',
              estado: 'en_espera',
              actor_id: t.creado_por,
            },
          ],
          cuando: en(t.creado_en, 40),
        });
      }
    }
    for (const m of menciones.filter((x) => x.usuario_id === u)) {
      c.push({
        evento: [
          'mencion',
          {
            mensaje_id: m.mensaje_id,
            ticket_id: m.ticket_id,
            ot_id: m.ot_id,
            tipo: m.tipo,
            usuario_ids: [u],
            actor_id: m.autor_id,
          },
        ],
        cuando: en(m.creado_en, 1),
        mencion: true,
      });
    }
    for (const s of seguimientos) {
      if (s.autor_id === u || !destinatarios(s.ticket_id).includes(u)) continue;
      if (!abierto(ticketDe(s.ticket_id))) continue;
      c.push({
        evento: [
          'ticket.seguimiento_nuevo',
          { ticket_id: s.ticket_id, mensaje_id: s.id, actor_id: s.autor_id, copiado: false },
        ],
        cuando: en(s.creado_en, 1),
      });
    }
    for (const t of tareas.filter((x) => x.responsable_id === u && x.creado_por !== u)) {
      c.push({
        evento: [
          'tarea.asignada',
          {
            tarea_id: t.id,
            ticket_id: t.ticket_id,
            ot_id: t.ot_id,
            usuario_id: u,
            actor_id: t.creado_por,
          },
        ],
        cuando: en(t.creado_en, 1),
      });
    }
    for (const o of ots) {
      if (o.tipo === 'interna' && o.etapa === 'borrador' && o.aprobador_id === u) {
        c.push({
          evento: ['ot.por_aprobar', { ot_id: o.id, aprobador_id: u }],
          cuando: en(o.creado_en, 2),
        });
      }
      if (o.etapa === 'cerrada' && o.cerrada_en) {
        if (o.tipo === 'facturable' && puedeFacturar.has(u)) {
          c.push({ evento: ['ot.por_facturar', { ot_id: o.id }], cuando: o.cerrada_en });
        }
        if (destinatarios(o.ticket_id).includes(u)) {
          c.push({
            evento: [
              'ot.cerrada',
              {
                ot_id: o.id,
                ticket_id: o.ticket_id,
                resolvio_ticket: o.resolvio_ticket === true,
                destinatarios_ids: [u],
              },
            ],
            cuando: o.cerrada_en,
          });
        }
      }
    }
    for (const k of cotizaciones) {
      const o = ots.find((x) => x.id === k.ot_id)!;
      const respondida = k.aprobada_en ?? k.rechazada_en;
      if (!respondida || !destinatarios(o.ticket_id).includes(u)) continue;
      c.push({
        evento: [
          'cotizacion.respondida',
          {
            ot_id: o.id,
            cotizacion_id: k.id,
            resultado: k.estado === 'aprobada' ? 'aprobada' : 'rechazada',
            destinatarios_ids: [u],
          },
        ],
        cuando: respondida,
      });
    }

    // Las más recientes primero y como máximo 12. Sin leer: lo de los últimos 3 días y las menciones de la última semana.
    const elegidos = c
      .sort((a, b) => new Date(b.cuando).getTime() - new Date(a.cuando).getTime())
      .slice(0, MAX_POR_PERSONA);
    const leidos = elegidos.map(
      (a) => ahora - tope(a.cuando).getTime() >= (a.mencion ? 7 : 3) * DIA,
    );
    // mezcla de leídos y sin leer: si todo quedó de un solo lado, el más antiguo se lee o el más reciente no
    if (leidos.length > 1 && leidos.every((x) => !x)) leidos[leidos.length - 1] = true;
    if (leidos.length > 1 && leidos.every((x) => x)) leidos[0] = false;
    await enTransaccion(async (tx) => {
      for (const [i, a] of elegidos.entries())
        await insertar(tx, u, a.evento, tope(a.cuando), leidos[i]!);
    });
  }

  // Rodrigo Álamos no recibe por Telegram el aviso de «nuevo seguimiento»: una fila explícita distinta del defecto
  await dataSource.query(
    `INSERT INTO preferencia_aviso (usuario_id, evento, canal, activo)
     VALUES ($1, 'seguimiento', 'telegram', false) ON CONFLICT DO NOTHING`,
    [personas.get('ralamos')],
  );
}
