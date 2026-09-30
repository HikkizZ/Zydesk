import type { IncomingMessage } from 'node:http';
import type { Request } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

export function crearLogHttp(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (req) => (req as IncomingMessage & { id: string }).id,
    autoLogging: true,
    serializers: { req: () => undefined, res: () => undefined },
    customAttributeKeys: { responseTime: 'duracion_ms', reqId: 'req_id' },
    customProps: (req, res) => {
      // pino-http también invoca customProps al inicio; solo aportamos campos al final.
      if (!res.headersSent) return {};
      const r = req as unknown as Request;
      return {
        metodo: r.method,
        ruta: r.route
          ? `${r.baseUrl}${r.route.path === '/' ? '' : r.route.path}`
          : r.originalUrl.split('?')[0],
        status: res.statusCode,
      };
    },
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    customSuccessMessage: () => 'petición completada',
    customErrorMessage: () => 'petición con error',
  });
}
