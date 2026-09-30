import type { EventosDominio, NombreEventoDominio } from '@zydesk/shared';
import { EventEmitter } from 'node:events';
import { logger } from '../../config/logger.js';

// Emisor tipado de eventos de dominio (ADR 0008). Se publica siempre DESPUÉS del commit (ADR 0003):
// los servicios devuelven de `enTransaccion` una lista de `EventoPendiente` y la pasan a
// `publicarPendientes` al salir. El despachador de avisos se conecta aquí en la Fase 6.
class EmisorDominio extends EventEmitter {
  override on<N extends NombreEventoDominio>(
    nombre: N,
    fn: (datos: EventosDominio[N]) => void,
  ): this {
    return super.on(nombre, fn);
  }

  override off<N extends NombreEventoDominio>(
    nombre: N,
    fn: (datos: EventosDominio[N]) => void,
  ): this {
    return super.off(nombre, fn);
  }
}

export const eventosDominio = new EmisorDominio();

export type EventoPendiente = {
  [N in NombreEventoDominio]: [nombre: N, datos: EventosDominio[N]];
}[NombreEventoDominio];

export function publicar<N extends NombreEventoDominio>(nombre: N, datos: EventosDominio[N]): void {
  eventosDominio.emit(nombre, datos);
}

export function publicarPendientes(pendientes: readonly EventoPendiente[]): void {
  for (const [nombre, datos] of pendientes) publicar(nombre, datos);
}

// Único oyente de la Fase 3: solo ids, nunca contenido (ADR 0017).
const NOMBRES: NombreEventoDominio[] = [
  'ot.cerrada',
  'ot.por_facturar',
  'ot.por_aprobar',
  'ot.cancelada',
];
for (const nombre of NOMBRES) {
  eventosDominio.on(nombre, (datos) => {
    logger.debug({ evento: nombre, ...datos }, 'evento de dominio');
  });
}
