import { ETIQUETA_FORMA_APROBACION, type FormaAprobacion } from '@zydesk/shared';
import {
  describirEvento,
  type DescripcionEvento,
  type EventoDatos,
} from '@/features/tickets/eventos';

const CAMPOS: Record<string, string> = {
  tipo: 'el tipo',
  titulo: 'el título',
  alcance: 'el alcance',
  responsable_tecnico: 'el responsable técnico',
  cliente: 'el cliente',
  contacto: 'el contacto',
  inicio: 'el inicio',
  termino: 'el término',
  oc_cliente: 'la OC del cliente',
  condicion_pago: 'la condición de pago',
  descuenta_bolsa: 'el descuento de la bolsa',
  centro_costo: 'el centro de costo',
  area_solicitante: 'el área solicitante',
  aprobador: 'quien aprueba',
  etapa: 'la etapa',
  estado_facturacion: 'la facturación',
};

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const codigoDe = (v: unknown): string | null =>
  v && typeof v === 'object' ? texto((v as Record<string, unknown>)['codigo']) : null;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function describirCambio(e: EventoDatos): DescripcionEvento {
  const campo = e.campo ?? '';
  const datos = e.datos ?? {};
  const cambio = `${e.valor_anterior ?? '—'} → ${e.valor_nuevo ?? '—'}`;

  if (campo === 'estado_facturacion' && texto(datos['n_factura'])) {
    return { texto: `marcó la OT como facturada · N° ${texto(datos['n_factura'])}` };
  }

  const detalle: string[] = [];
  if (campo === 'etapa') {
    const motivo = texto(datos['motivo']);
    if (motivo) detalle.push(motivo);
    const aprobo = texto(datos['aprobada_por']);
    if (aprobo) detalle.push(`aprobó ${aprobo}`);
    const contacto = texto(datos['contacto']);
    if (contacto) {
      const forma = texto(datos['forma']) as FormaAprobacion | null;
      const etiquetaForma = forma ? (ETIQUETA_FORMA_APROBACION[forma] ?? forma) : null;
      detalle.push(
        `contacto ${contacto}${etiquetaForma ? ` · ${etiquetaForma.toLowerCase()}` : ''}`,
      );
    }
    if (typeof datos['resolvio_ticket'] === 'boolean') {
      detalle.push(datos['resolvio_ticket'] ? 'resolvió el ticket' : 'no resolvió el ticket');
    }
  }
  return {
    texto: `cambió ${CAMPOS[campo] ?? campo}`.trim(),
    cambio,
    ...(detalle.length > 0 ? { detalle: detalle.join(' · ') } : {}),
  };
}

// Frase del historial de una OT. Los eventos de tareas se describen como en un ticket.
export function describirEventoOt(e: EventoDatos): DescripcionEvento {
  const datos = e.datos ?? {};
  switch (e.accion) {
    case 'creada': {
      const ticket = codigoDe(datos['desde_ticket']);
      const ot = codigoDe(datos['desde_ot']);
      return {
        texto: `creó la OT${ticket ? ` desde ${ticket}` : ''}${ot ? ` a partir de ${ot}` : ''}`,
      };
    }
    case 'cambio':
      return describirCambio(e);
    case 'tareas_traspasadas': {
      const n = typeof datos['n'] === 'number' ? datos['n'] : 0;
      const desde = texto(datos['desde']);
      return { texto: `recibió ${plural(n, 'tarea', 'tareas')}${desde ? ` de ${desde}` : ''}` };
    }
    case 'archivos_agregados': {
      const n = typeof datos['n'] === 'number' ? datos['n'] : 0;
      return { texto: `agregó ${plural(n, 'archivo', 'archivos')}` };
    }
    default:
      return describirEvento(e);
  }
}
