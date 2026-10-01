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

// Campos de la cotización que registra su edición (`datos.cotizacion_id`, spec fase 4 §5.3).
const CAMPOS_COTIZACION: Record<string, string> = {
  contacto: 'el contacto',
  fecha_emision: 'la fecha de emisión',
  validez_dias: 'la validez',
  moneda: 'la moneda',
  valor_uf: 'el valor de la UF',
  aplica_iva: 'el IVA',
  lineas: 'las líneas',
  neto: 'el neto',
  total: 'el total',
  condiciones: 'las condiciones',
  nota_interna: 'la nota interna',
};

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const codigoDe = (v: unknown): string | null =>
  v && typeof v === 'object' ? texto((v as Record<string, unknown>)['codigo']) : null;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// "COT-0218 v1": el valor que guarda la API o, si falta, se arma con los datos.
function versionDe(e: EventoDatos, valor: string | null): string {
  if (valor) return valor;
  const datos = e.datos ?? {};
  const codigo = texto(datos['codigo']);
  if (!codigo) return 'la cotización';
  return typeof datos['version'] === 'number' ? `${codigo} v${datos['version']}` : codigo;
}

function describirCambio(e: EventoDatos): DescripcionEvento {
  const campo = e.campo ?? '';
  const datos = e.datos ?? {};
  const cambio = `${e.valor_anterior ?? '—'} → ${e.valor_nuevo ?? '—'}`;

  // La edición de la cotización; el cambio de etapa que la acompaña se describe como el de la OT.
  if (campo !== 'etapa' && datos['cotizacion_id'] !== undefined) {
    const version = typeof datos['version'] === 'number' ? datos['version'] : null;
    return {
      texto: `cambió ${CAMPOS_COTIZACION[campo] ?? campo} de la cotización`,
      cambio,
      ...(version === null ? {} : { detalle: `Versión ${version}` }),
    };
  }

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
    case 'cotizacion_creada': {
      const desde = typeof datos['desde_version'] === 'number' ? datos['desde_version'] : null;
      return {
        texto: `creó la cotización${desde === null ? '' : ` a partir de la v${desde}`}`,
        cambio: versionDe(e, e.valor_nuevo),
      };
    }
    case 'cotizacion_enviada':
      return { texto: 'marcó como enviada', cambio: versionDe(e, e.valor_nuevo) };
    case 'cotizacion_aprobada':
      return { texto: 'el cliente aprobó', cambio: versionDe(e, e.valor_nuevo) };
    case 'cotizacion_rechazada':
      return { texto: 'el cliente rechazó', cambio: versionDe(e, e.valor_nuevo) };
    case 'cotizacion_lineas_agregadas': {
      const n = typeof datos['n'] === 'number' ? datos['n'] : 0;
      const origen = datos['origen'] === 'plantilla' ? 'la plantilla' : 'las tareas';
      return { texto: `agregó ${plural(n, 'línea', 'líneas')} desde ${origen}` };
    }
    case 'cotizacion_descargada':
      return {
        texto: `descargó ${versionDe(e, null)} en .${texto(datos['formato']) ?? 'archivo'}`,
      };
    case 'cotizacion_eliminada':
      return { texto: `eliminó el borrador ${versionDe(e, e.valor_anterior)}` };
    default:
      return describirEvento(e);
  }
}
