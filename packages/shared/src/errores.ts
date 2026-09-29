export const CODIGOS_ERROR = {
  VALIDACION: 400,
  NO_AUTENTICADO: 401,
  SIN_PERMISO: 403,
  NO_ENCONTRADO: 404,
  CONFLICTO: 409,
  INTERNO: 500,
} as const;
export type CodigoError = keyof typeof CODIGOS_ERROR;
