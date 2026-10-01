import type { ErrorRequestHandler, RequestHandler } from 'express';
import { QueryFailedError } from 'typeorm';
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
  // Otros errores del lector del cuerpo (body-parser/raw-body): 4xx del cliente, sin registrar el error.
  const lector = err as { status?: unknown; type?: unknown } | null;
  if (
    typeof lector?.status === 'number' &&
    lector.status >= 400 &&
    lector.status < 500 &&
    typeof lector.type === 'string'
  ) {
    logger.warn({ tipo: lector.type, status: lector.status }, 'cuerpo de petición rechazado');
    if (lector.type === 'entity.too.large') {
      res.status(413).json({
        error: {
          codigo: 'CUERPO_MUY_GRANDE',
          mensaje: 'El cuerpo de la petición es demasiado grande',
        },
      });
    } else if (lector.type === 'charset.unsupported' || lector.type === 'encoding.unsupported') {
      res.status(415).json({
        error: { codigo: 'TIPO_NO_SOPORTADO', mensaje: 'Codificación del cuerpo no soportada' },
      });
    } else {
      res
        .status(lector.status)
        .json({ error: { codigo: 'VALIDACION', mensaje: 'Datos inválidos' } });
    }
    return;
  }
  // QueryFailedError trae `query` y `parameters` (contenido y montos): no se registran.
  if (err instanceof QueryFailedError) {
    logger.error(
      {
        err: {
          type: err.name,
          message: err.message,
          code: (err.driverError as { code?: unknown } | undefined)?.code,
          stack: err.stack,
        },
      },
      'error no controlado',
    );
  } else {
    logger.error({ err }, 'error no controlado');
  }
  res.status(500).json({ error: { codigo: 'INTERNO', mensaje: 'Error interno' } });
};
