import {
  NOMBRES_EVENTOS_DOMINIO,
  type EventosDominio,
  type NombreEventoDominio,
} from '@zydesk/shared';
import { EventEmitter } from 'node:events';
import { logger } from '../../config/logger.js';

// Emisor tipado de eventos de dominio (ADR 0008). Se publica siempre DESPUÉS del commit (ADR 0003):
// los servicios devuelven de `enTransaccion` una lista de `EventoPendiente` y la pasan a
// `publicarPendientes` al salir. El despachador de avisos (`avisos/despachador.ts`) se suscribe a los mismos eventos.
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

// Oyente de log de todos los eventos: solo ids, nunca contenido (ADR 0017).
for (const nombre of NOMBRES_EVENTOS_DOMINIO) {
  eventosDominio.on(nombre, (datos) => {
    logger.debug({ evento: nombre, ...datos }, 'evento de dominio');
  });
}
