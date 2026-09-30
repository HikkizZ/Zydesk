import {
  ESTADOS_TICKET,
  ETIQUETA_ESTADO_TICKET,
  ETIQUETA_PRIORIDAD,
  PRIORIDADES,
  type EstadoTicket,
  type Prioridad,
} from '@zydesk/shared';
import type { TicketResumenDatos } from '@/features/tickets/api';

export const MODOS_AGRUPAR = ['prioridad', 'estado', 'responsable', 'cliente', 'ninguno'] as const;
export type ModoAgrupar = (typeof MODOS_AGRUPAR)[number];

export const ETIQUETA_AGRUPAR: Record<ModoAgrupar, string> = {
  prioridad: 'Prioridad',
  estado: 'Estado',
  responsable: 'Responsable',
  cliente: 'Cliente',
  ninguno: 'Sin agrupar',
};

export interface GrupoTickets {
  clave: string;
  /** `null` = sin cabecera (modo "ninguno"). */
  titulo: string | null;
  /** Clase del punto de color de la cabecera (decorativo: el título siempre va en texto). */
  punto?: string;
  tickets: TicketResumenDatos[];
}

const PUNTO_PRIORIDAD: Record<Prioridad, string> = {
  urgente: 'bg-urgente-punto',
  alta: 'bg-alta-punto',
  media: 'bg-media-punto',
  baja: 'bg-baja-punto',
};

const PUNTO_ESTADO: Record<EstadoTicket, string> = {
  nuevo: 'bg-baja-punto',
  en_curso: 'bg-acento',
  en_espera: 'bg-alta-punto',
  resuelto: 'bg-resuelto',
  descartado: 'bg-baja-punto',
  duplicado: 'bg-baja-punto',
};

// Agrupa la página actual en el cliente (spec fase 2 §12); los grupos vacíos no se muestran.
export function agrupar(tickets: TicketResumenDatos[], modo: ModoAgrupar): GrupoTickets[] {
  switch (modo) {
    case 'ninguno':
      return tickets.length > 0 ? [{ clave: 'todos', titulo: null, tickets }] : [];
    case 'prioridad':
      return PRIORIDADES.map((p) => ({
        clave: p,
        titulo: ETIQUETA_PRIORIDAD[p],
        punto: PUNTO_PRIORIDAD[p],
        tickets: tickets.filter((t) => t.prioridad === p),
      })).filter((g) => g.tickets.length > 0);
    case 'estado':
      return ESTADOS_TICKET.map((e) => ({
        clave: e,
        titulo: ETIQUETA_ESTADO_TICKET[e],
        punto: PUNTO_ESTADO[e],
        tickets: tickets.filter((t) => t.estado === e),
      })).filter((g) => g.tickets.length > 0);
    case 'responsable':
    case 'cliente': {
      const vacio = modo === 'responsable' ? 'Sin asignar' : 'Sin cliente';
      const porClave = new Map<string, GrupoTickets>();
      for (const t of tickets) {
        const titulo =
          (modo === 'responsable' ? t.responsables[0]?.nombre : t.cliente?.nombre) ?? vacio;
        const grupo = porClave.get(titulo) ?? { clave: titulo, titulo, tickets: [] };
        grupo.tickets.push(t);
        porClave.set(titulo, grupo);
      }
      return [...porClave.values()].sort((a, b) =>
        a.titulo === vacio
          ? 1
          : b.titulo === vacio
            ? -1
            : (a.titulo ?? '').localeCompare(b.titulo ?? '', 'es'),
      );
    }
  }
}
