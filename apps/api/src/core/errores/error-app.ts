import { CODIGOS_ERROR, type CodigoError } from '@zydesk/shared';

export class ErrorApp extends Error {
  constructor(
    public codigo: CodigoError,
    mensaje: string,
    public detalles?: unknown,
  ) {
    super(mensaje);
  }

  get status(): number {
    return CODIGOS_ERROR[this.codigo];
  }
}
