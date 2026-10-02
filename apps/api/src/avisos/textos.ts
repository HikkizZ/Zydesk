import {
  ETIQUETA_ESPERA_DE,
  ETIQUETA_ESTADO_TICKET,
  ZONA,
  type EsperaDe,
  type EstadoTicket,
  type EventoAviso,
  type TipoAviso,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import type { EventoPendiente } from '../core/eventos/dominio.js';

// Aviso listo para insertar (sin destinatarios ni preferencias). `texto` se arma solo con ids, códigos,
// asunto/título, nombre del actor, etiquetas de estado y nombre del cliente: jamás con el contenido de
// mensajes o notas, montos ni motivos (fase 6 §4.4).
export interface AvisoPlan {
  evento: Exclude<EventoAviso, 'resumen_diario'>;
  tipo: TipoAviso;
  clave: string | null;
  texto: string;
  enlace: string;
  entidad: 'ticket' | 'ot';
  entidad_id: number;
  datos: Record<string, unknown>;
  actor_id: number | null;
}

const MAX_TEXTO = 300;
const MAX_ASUNTO = 80;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// El asunto o título va recortado a 80 caracteres con «…».
export const recortarAsunto = (s: string): string =>
  s.length > MAX_ASUNTO ? `${s.slice(0, MAX_ASUNTO - 1).trimEnd()}…` : s;

const titulo = (s: string): string => `«${recortarAsunto(s)}»`;

interface PartesFecha {
  fecha: string; // YYYY-MM-DD en Santiago
  hora: string; // HH:mm
  dia: number;
  mes: string;
}

function partes(d: Date): PartesFecha {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return {
    fecha: `${p['year']}-${p['month']}-${p['day']}`,
    hora: `${p['hour']}:${p['minute']}`,
    dia: Number(p['day']),
    mes: MESES[Number(p['month']) - 1]!,
  };
}

const diaSiguiente = (fecha: string): string => {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
};

// «hoy a las 18:00», «mañana a las 09:00» o «el 3 oct a las 09:00» (hora de Santiago).
function cuando(limite: Date, ahora: Date): string {
  const l = partes(limite);
  const hoy = partes(ahora).fecha;
  if (l.fecha === hoy) return `hoy a las ${l.hora}`;
  if (l.fecha === diaSiguiente(hoy)) return `mañana a las ${l.hora}`;
  return `el ${l.dia} ${l.mes} a las ${l.hora}`;
}

interface FilaTicket {
  id: number;
  codigo: string;
  asunto: string;
  espera_de: EsperaDe | null;
}
interface FilaOt {
  id: number;
  codigo: string;
  titulo: string;
  tipo: 'facturable' | 'interna';
  ticket_id: number;
  ticket_codigo: string;
  resolvio_ticket: boolean | null;
  creado_por: number | null;
  cliente_nombre: string | null;
}

async function ticketDe(m: EntityManager, id: number): Promise<FilaTicket | null> {
  const [t]: FilaTicket[] = await m.query(
    `SELECT id, codigo, asunto, espera_de FROM ticket WHERE id = $1`,
    [id],
  );
  return t ?? null;
}

async function otDe(m: EntityManager, id: number): Promise<FilaOt | null> {
  const [o]: FilaOt[] = await m.query(
    `SELECT o.id, o.codigo, o.titulo, o.tipo, o.ticket_id, t.codigo AS ticket_codigo,
            o.resolvio_ticket, o.creado_por, c.nombre AS cliente_nombre
       FROM ot o JOIN ticket t ON t.id = o.ticket_id LEFT JOIN cliente c ON c.id = o.cliente_id
      WHERE o.id = $1`,
    [id],
  );
  return o ?? null;
}

async function nombreDe(m: EntityManager, id: number | null): Promise<string | null> {
  if (id === null) return null;
  const [u]: { nombre: string }[] = await m.query(`SELECT nombre FROM usuario WHERE id = $1`, [id]);
  return u?.nombre ?? null;
}

const enlaceTicket = (id: number, mensaje_id?: number): string =>
  `/tickets/${id}${mensaje_id === undefined ? '' : `#mensaje-${mensaje_id}`}`;
const enlaceOt = (id: number, mensaje_id?: number): string =>
  `/ots/${id}${mensaje_id === undefined ? '' : `#mensaje-${mensaje_id}`}`;

// Arma el aviso de un evento de dominio, o `null` si la entidad ya no existe. `ahora` solo importa en los
// avisos de vencimiento («hoy» / «mañana»).
export async function construirAviso(
  m: EntityManager,
  evento: EventoPendiente,
  ahora: Date = new Date(),
): Promise<AvisoPlan | null> {
  const plan = await armar(m, evento, ahora);
  return plan ? { ...plan, texto: plan.texto.slice(0, MAX_TEXTO) } : null;
}

async function armar(
  m: EntityManager,
  [nombre, d]: EventoPendiente,
  ahora: Date,
): Promise<AvisoPlan | null> {
  switch (nombre) {
    case 'ticket.asignado': {
      const t = await ticketDe(m, d.ticket_id);
      if (!t) return null;
      const actor = await nombreDe(m, d.actor_id);
      return {
        evento: 'asignacion',
        tipo: 'ticket_asignado',
        clave: null,
        texto: `${actor ? `${actor} te asignó` : 'Te asignaron'} ${t.codigo} ${titulo(t.asunto)}`,
        enlace: enlaceTicket(t.id),
        entidad: 'ticket',
        entidad_id: t.id,
        datos: { codigo: t.codigo },
        actor_id: d.actor_id,
      };
    }
    case 'ticket.seguidor_agregado': {
      const t = await ticketDe(m, d.ticket_id);
      if (!t) return null;
      const actor = await nombreDe(m, d.actor_id);
      return {
        evento: 'asignacion',
        tipo: 'seguidor_agregado',
        clave: null,
        texto: `${actor ? `${actor} te agregó` : 'Te agregaron'} como seguidor de ${t.codigo} ${titulo(t.asunto)}`,
        enlace: enlaceTicket(t.id),
        entidad: 'ticket',
        entidad_id: t.id,
        datos: { codigo: t.codigo },
        actor_id: d.actor_id,
      };
    }
    case 'tarea.asignada': {
      const [tarea]: { titulo: string }[] = await m.query(
        `SELECT titulo FROM tarea WHERE id = $1`,
        [d.tarea_id],
      );
      if (!tarea) return null;
      const t = d.ticket_id !== null ? await ticketDe(m, d.ticket_id) : null;
      const o = d.ot_id !== null ? await otDe(m, d.ot_id) : null;
      const destino = o ?? t;
      if (!destino) return null;
      const actor = await nombreDe(m, d.actor_id);
      return {
        evento: 'asignacion',
        tipo: 'tarea_asignada',
        clave: null,
        texto: `${actor ? `${actor} te asignó` : 'Te asignaron'} la tarea ${titulo(tarea.titulo)} en ${destino.codigo}`,
        enlace: o ? enlaceOt(o.id) : enlaceTicket(destino.id),
        entidad: o ? 'ot' : 'ticket',
        entidad_id: destino.id,
        datos: { codigo: destino.codigo, tarea_id: d.tarea_id },
        actor_id: d.actor_id,
      };
    }
    case 'ot.por_aprobar': {
      const o = await otDe(m, d.ot_id);
      if (!o) return null;
      // El evento no trae al autor del cambio: se nombra a quien creó la OT, si no es el propio aprobador
      const solicitante = o.creado_por === d.aprobador_id ? null : await nombreDe(m, o.creado_por);
      return {
        evento: 'asignacion',
        tipo: 'ot_por_aprobar',
        clave: `por_aprobar:ot:${o.id}`,
        texto: `${solicitante ? `${solicitante} te pidió` : 'Te pidieron'} aprobar la ${o.codigo} (interna)`,
        enlace: enlaceOt(o.id),
        entidad: 'ot',
        entidad_id: o.id,
        datos: { codigo: o.codigo },
        actor_id: null,
      };
    }
    case 'mencion': {
      const o = d.ot_id !== null ? await otDe(m, d.ot_id) : null;
      const t = d.ticket_id !== null ? await ticketDe(m, d.ticket_id) : null;
      const destino = o ?? t;
      if (!destino) return null;
      const actor = await nombreDe(m, d.actor_id);
      const que = d.tipo === 'nota_interna' ? 'una nota interna' : 'un seguimiento';
      return {
        evento: 'mencion',
        tipo: 'mencion',
        clave: null,
        texto: `${actor ?? 'Alguien'} te mencionó en ${que} de ${destino.codigo}`,
        enlace: o ? enlaceOt(o.id, d.mensaje_id) : enlaceTicket(destino.id, d.mensaje_id),
        entidad: o ? 'ot' : 'ticket',
        entidad_id: destino.id,
        datos: { codigo: destino.codigo, mensaje_id: d.mensaje_id },
        actor_id: d.actor_id,
      };
    }
    case 'ticket.vence_pronto':
    case 'ticket.vencio': {
      const t = await ticketDe(m, d.ticket_id);
      if (!t) return null;
      const limite = new Date(d.fecha_limite);
      const venceYa = nombre === 'ticket.vencio';
      return {
        evento: venceYa ? 'vencio' : 'vence_pronto',
        tipo: venceYa ? 'vencio' : 'vence_pronto',
        clave: `${venceYa ? 'vencio' : 'vence_pronto'}:ticket:${t.id}:${d.fecha_limite}`,
        texto: `${t.codigo} ${titulo(t.asunto)} ${venceYa ? 'venció' : 'vence'} ${cuando(limite, ahora)}`,
        enlace: enlaceTicket(t.id),
        entidad: 'ticket',
        entidad_id: t.id,
        datos: { codigo: t.codigo },
        actor_id: null,
      };
    }
    case 'ticket.estado_cambiado': {
      const t = await ticketDe(m, d.ticket_id);
      if (!t) return null;
      const actor = await nombreDe(m, d.actor_id);
      const etiqueta =
        d.estado === 'en_espera' && t.espera_de
          ? `${ETIQUETA_ESTADO_TICKET[d.estado]} · ${ETIQUETA_ESPERA_DE[t.espera_de]}`
          : ETIQUETA_ESTADO_TICKET[d.estado as EstadoTicket];
      return {
        evento: 'estado_ticket',
        tipo: 'estado_ticket',
        clave: null,
        texto: `${actor ? `${actor} cambió ${t.codigo}` : `${t.codigo} cambió`} a ${etiqueta}`,
        enlace: enlaceTicket(t.id),
        entidad: 'ticket',
        entidad_id: t.id,
        datos: { codigo: t.codigo },
        actor_id: d.actor_id,
      };
    }
    case 'ot.cerrada': {
      const o = await otDe(m, d.ot_id);
      if (!o) return null;
      const resultado = d.resolvio_ticket
        ? `resolvió el ticket ${o.ticket_codigo}`
        : `el ticket ${o.ticket_codigo} sigue abierto`;
      return {
        evento: 'estado_ticket',
        tipo: 'ot_cerrada',
        clave: `ot_cerrada:ot:${o.id}`,
        texto: `${o.codigo} se cerró · ${resultado}`,
        enlace: enlaceOt(o.id),
        entidad: 'ot',
        entidad_id: o.id,
        datos: { codigo: o.codigo, ticket_id: o.ticket_id },
        actor_id: null,
      };
    }
    case 'ot.cancelada': {
      const o = await otDe(m, d.ot_id);
      if (!o) return null;
      return {
        evento: 'estado_ticket',
        tipo: 'ot_cancelada',
        clave: `ot_cancelada:ot:${o.id}`,
        texto: `${o.codigo} fue cancelada · ${o.ticket_codigo}`,
        enlace: enlaceOt(o.id),
        entidad: 'ot',
        entidad_id: o.id,
        datos: { codigo: o.codigo, ticket_id: o.ticket_id },
        actor_id: null,
      };
    }
    case 'ticket.seguimiento_nuevo': {
      const t = await ticketDe(m, d.ticket_id);
      if (!t) return null;
      const actor = (await nombreDe(m, d.actor_id)) ?? 'Alguien';
      let texto = `${actor} registró un seguimiento en ${t.codigo}`;
      if (d.copiado) {
        const [origen]: { codigo: string }[] = await m.query(
          `SELECT o.codigo FROM mensaje c JOIN mensaje s ON s.id = c.copiado_desde_id
             JOIN ot o ON o.id = s.ot_id WHERE c.id = $1`,
          [d.mensaje_id],
        );
        if (origen) texto = `${actor} copió un seguimiento de ${origen.codigo} a ${t.codigo}`;
      }
      return {
        evento: 'seguimiento',
        tipo: 'seguimiento',
        clave: null,
        texto,
        enlace: enlaceTicket(t.id, d.mensaje_id),
        entidad: 'ticket',
        entidad_id: t.id,
        datos: { codigo: t.codigo, mensaje_id: d.mensaje_id },
        actor_id: d.actor_id,
      };
    }
    case 'cotizacion.respondida': {
      const [c]: { codigo: string; version: number; ot_codigo: string; cliente: string | null }[] =
        await m.query(
          `SELECT c.codigo, c.version, o.codigo AS ot_codigo, cl.nombre AS cliente
             FROM cotizacion c JOIN ot o ON o.id = c.ot_id LEFT JOIN cliente cl ON cl.id = o.cliente_id
            WHERE c.id = $1`,
          [d.cotizacion_id],
        );
      if (!c) return null;
      const aprobada = d.resultado === 'aprobada';
      return {
        evento: 'cotizacion',
        tipo: aprobada ? 'cotizacion_aprobada' : 'cotizacion_rechazada',
        clave: `cotizacion:${d.cotizacion_id}:${d.resultado}`,
        texto: `El cliente ${aprobada ? 'aprobó' : 'rechazó'} la cotización ${c.codigo} v${c.version}${c.cliente ? ` · ${c.cliente}` : ''}`,
        enlace: `/cotizaciones/${d.cotizacion_id}`,
        entidad: 'ot',
        entidad_id: d.ot_id,
        datos: { codigo: c.ot_codigo, ot_id: d.ot_id, cotizacion_id: d.cotizacion_id },
        actor_id: null,
      };
    }
    case 'ot.por_facturar': {
      const o = await otDe(m, d.ot_id);
      if (!o) return null;
      return {
        evento: 'por_facturar',
        tipo: 'por_facturar',
        clave: `por_facturar:ot:${o.id}`,
        texto: `${o.codigo} se cerró y quedó lista para facturar${o.cliente_nombre ? ` · ${o.cliente_nombre}` : ''}`,
        enlace: enlaceOt(o.id),
        entidad: 'ot',
        entidad_id: o.id,
        datos: { codigo: o.codigo },
        actor_id: null,
      };
    }
  }
}
