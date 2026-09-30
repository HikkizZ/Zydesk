import { ETIQUETA_ESPERA_DE, type EstadoTicket } from '../enums/ticket.js';
import type { EstadoFacturacion, TipoOt } from '../enums/ot.js';
import { formatearCLP } from '../formato/moneda.js';
import type { CierreOtDatos } from './ot.js';

export interface ContextoCierreOt {
  ot: { codigo: string; tipo: TipoOt; neto: number | null };
  ticket: {
    codigo: string;
    estado: EstadoTicket;
    responsables: { nombre: string }[];
    seguidores: { nombre: string }[];
  };
  // quien queda a cargo del siguiente paso (solo si !resolvio)
  responsable_siguiente: { nombre: string } | null;
}

export interface EfectosCierreOt {
  ot: string;
  ticket: string;
  historial: string;
  avisos: string;
  ticket_estado_final: EstadoTicket;
  estado_facturacion_final: EstadoFacturacion;
  crea_nueva_ot: boolean;
  destinatarios: string[]; // nombres únicos de responsables ∪ seguidores
}

function unir(nombres: string[]): string {
  return nombres.length <= 1
    ? (nombres[0] ?? '')
    : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

// ADR 0004: la misma función la usa el diálogo "Cerrar OT" (vista previa) y el servicio (efectos reales).
export function efectosCierreOt(ctx: ContextoCierreOt, p: CierreOtDatos): EfectosCierreOt {
  const { ot, ticket } = ctx;
  const facturable = ot.tipo === 'facturable';
  const nombreSiguiente = ctx.responsable_siguiente?.nombre ?? '';

  const textoOt = facturable
    ? `Pasa a Cerrada y queda «Por facturar»${ot.neto !== null ? ` (${formatearCLP(ot.neto)} neto)` : ''}. Se factura aunque no haya resuelto el ticket.`
    : 'Pasa a Cerrada. Es interna: no se factura.';

  let textoTicket: string;
  let ticket_estado_final: EstadoTicket;
  let crea_nueva_ot = false;
  if (p.resolvio_ticket) {
    textoTicket = 'Pasa a Resuelto.';
    ticket_estado_final = 'resuelto';
  } else {
    const siguiente = p.siguiente;
    if (siguiente.accion === 'en_curso') {
      textoTicket = `No se resuelve: sigue abierto y vuelve a En curso con ${nombreSiguiente}`;
      ticket_estado_final = 'en_curso';
    } else if (siguiente.accion === 'en_espera') {
      textoTicket = `No se resuelve: sigue abierto y pasa a En espera (${ETIQUETA_ESPERA_DE[siguiente.espera_de]}) con ${nombreSiguiente}`;
      ticket_estado_final = 'en_espera';
    } else {
      textoTicket = `No se resuelve: sigue abierto y se crea una OT nueva vinculada, a cargo de ${nombreSiguiente}`;
      ticket_estado_final = 'en_curso';
      crea_nueva_ot = true;
    }
  }

  const responsables = ticket.responsables.map((r) => r.nombre);
  const destinatarios = [...new Set([...responsables, ...ticket.seguidores.map((s) => s.nombre)])];

  return {
    ot: textoOt,
    ticket: textoTicket,
    historial: p.resolvio_ticket
      ? `En ${ticket.codigo} se registra «${ot.codigo} cerrada · resolvió el ticket» junto al resumen.`
      : `En ${ticket.codigo} se registra «${ot.codigo} cerrada · no resolvió el ticket» junto al resumen.`,
    avisos:
      responsables.length > 0
        ? `Se avisa a ${unir(responsables)} (responsables) y a quienes siguen el ticket.`
        : 'Se avisa a quienes siguen el ticket.',
    ticket_estado_final,
    estado_facturacion_final: facturable ? 'por_facturar' : 'no_aplica',
    crea_nueva_ot,
    destinatarios,
  };
}
