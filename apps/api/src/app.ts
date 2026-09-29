import express, { type Express } from 'express';
import helmet from 'helmet';
import type pino from 'pino';
import { logger as loggerGlobal } from './config/logger.js';
import { manejadorErrores, noEncontrado } from './core/errores/manejador.js';
import { crearLogHttp } from './core/http/log-http.js';
import { reqId } from './core/http/req-id.js';
import { crearRutaSalud } from './modulos/salud/salud.routes.js';

export interface DependenciasApp {
  comprobarBd: () => Promise<boolean>;
  logger?: pino.Logger;
}

export function crearApp(deps: DependenciasApp): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(reqId());
  app.use(crearLogHttp(deps.logger ?? loggerGlobal));
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/salud', crearRutaSalud(deps.comprobarBd));

  app.use('/api', noEncontrado);
  app.use(manejadorErrores);
  return app;
}
