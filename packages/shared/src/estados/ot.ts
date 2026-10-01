import { z } from 'zod';
import { ESPERA_DE } from '../enums/ticket.js';
import {
  ETAPAS_OT_FINALES,
  ETIQUETA_ETAPA_OT,
  type EstadoFacturacion,
  type EtapaOt,
  type TipoOt,
} from '../enums/ot.js';
import { id, texto } from '../esquemas/comunes.js';

// Máquina de etapas de la OT (ADR 0004): la etapa termina en `cerrada`; "Facturada" es
// `estado_facturacion`, no una etapa; `cancelada` es una salida, no un paso.
export function etapasDe(tipo: TipoOt): EtapaOt[] {
  return tipo === 'facturable'
    ? ['borrador', 'cotizada', 'aprobada', 'en_ejecucion', 'cerrada']
    : ['borrador', 'aprobada', 'en_ejecucion', 'cerrada'];
}

export function esEtapaFinal(e: EtapaOt): boolean {
  return (ETAPAS_OT_FINALES as readonly EtapaOt[]).includes(e);
}

export function transicionesEtapaDesde(tipo: TipoOt, e: EtapaOt): EtapaOt[] {
  if (esEtapaFinal(e)) return [];
  if (tipo === 'facturable') {
    switch (e) {
      case 'borrador':
        return ['cotizada', 'cancelada'];
      case 'cotizada':
        return ['aprobada', 'borrador', 'cancelada'];
      case 'aprobada':
        return ['en_ejecucion', 'cancelada'];
      case 'en_ejecucion':
        return ['cerrada', 'cancelada'];
      default:
        return [];
    }
  }
  switch (e) {
    case 'borrador':
      return ['aprobada', 'cancelada'];
    case 'aprobada':
      return ['en_ejecucion', 'cancelada'];
    case 'en_ejecucion':
      return ['cerrada', 'cancelada'];
    default:
      return [];
  }
}

export function puedeCambiarEtapa(tipo: TipoOt, desde: EtapaOt, hasta: EtapaOt): boolean {
  return desde !== hasta && transicionesEtapaDesde(tipo, desde).includes(hasta);
}

// Pasos de la barra de etapas: las etiquetas de `etapasDe(tipo)` más "Facturada" (sexto paso derivado,
// A1) si es facturable. `actual` es null si está cancelada.
export function pasoVisual(ot: {
  tipo: TipoOt;
  etapa: EtapaOt;
  estado_facturacion: EstadoFacturacion;
}): {
  pasos: string[];
  actual: number | null;
} {
  const etapas = etapasDe(ot.tipo);
  const pasos = etapas.map((e) => ETIQUETA_ETAPA_OT[e]);
  if (ot.tipo === 'facturable') pasos.push('Facturada');
  if (ot.etapa === 'cancelada') return { pasos, actual: null };
  if (ot.tipo === 'facturable' && ot.etapa === 'cerrada' && ot.estado_facturacion === 'facturada') {
    return { pasos, actual: pasos.length - 1 };
  }
  return { pasos, actual: etapas.indexOf(ot.etapa) };
}

export function estadoFacturacionInicial(tipo: TipoOt): EstadoFacturacion {
  return tipo === 'facturable' ? 'pendiente' : 'no_aplica';
}

// Solo etapas sin permiso especial (aprobar, cerrar, cancelar y facturar son acciones propias).
// `cotizada` ya no se marca a mano: se alcanza al marcar una cotización como enviada (spec fase 4 §6.2).
export const CambioEtapaOt = z.object({ etapa: z.enum(['borrador', 'en_ejecucion']) });
export type CambioEtapaOtDatos = z.infer<typeof CambioEtapaOt>;

export const CierreOt = z.discriminatedUnion('resolvio_ticket', [
  z.object({ resolvio_ticket: z.literal(true), resumen: texto(5000) }),
  z.object({
    resolvio_ticket: z.literal(false),
    resumen: texto(5000),
    siguiente: z.discriminatedUnion('accion', [
      z.object({ accion: z.literal('en_curso'), responsable_id: id }),
      z.object({
        accion: z.literal('en_espera'),
        responsable_id: id,
        espera_de: z.enum(ESPERA_DE),
        espera_detalle: texto(120).optional(),
      }),
      z.object({ accion: z.literal('nueva_ot'), responsable_id: id }),
    ]),
  }),
]);
export type CierreOtDatos = z.infer<typeof CierreOt>;

export const CancelarOt = z.object({ motivo: texto(500) });
export type CancelarOtDatos = z.infer<typeof CancelarOt>;

export const FacturarOt = z.object({ n_factura: texto(40) });
export type FacturarOtDatos = z.infer<typeof FacturarOt>;
