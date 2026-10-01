import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../../config/logger.js';
import { ErrorApp } from './error-app.js';

export const noEncontrado: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Ruta no encontrada' } });
};

export const manejadorErrores: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ErrorApp) {
    res.status(err.status).json({
      error: {
        codigo: err.codigo,
        mensaje: err.message,
        ...(err.detalles !== undefined && { detalles: err.detalles }),
      },
    });
    return;
  }
  // JSON malformado: error del cliente. El error trae el texto del body: no se registra.
  if ((err as { type?: unknown } | null)?.type === 'entity.parse.failed') {
    res.status(400).json({
      error: {
        codigo: 'VALIDACION',
        mensaje: 'Datos inválidos',
        detalles: { body: ['JSON malformado'] },
      },
    });
    return;
  }
  logger.error({ err }, 'error no controlado');
  res.status(500).json({ error: { codigo: 'INTERNO', mensaje: 'Error interno' } });
};
