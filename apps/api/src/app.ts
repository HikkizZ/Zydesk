import cookieParser from 'cookie-parser';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import type pino from 'pino';
import { env } from './config/env.js';
import { logger as loggerGlobal } from './config/logger.js';
import { csrf } from './core/auth/csrf.js';
import './core/auth/seguridad.js';
import { manejadorErrores, noEncontrado } from './core/errores/manejador.js';
import { crearRutasDocs } from './core/http/docs.routes.js';
import { crearLogHttp } from './core/http/log-http.js';
import { reqId } from './core/http/req-id.js';
import { crearRutasAuditoria } from './modulos/auditoria/auditoria.routes.js';
import { crearRutasAuth } from './modulos/auth/auth.routes.js';
import { crearRutasLegal } from './modulos/legal/legal.routes.js';
import { crearRutaSalud } from './modulos/salud/salud.routes.js';
import { crearRutasUsuarios } from './modulos/usuarios/usuarios.routes.js';

export interface DependenciasApp {
  comprobarBd: () => Promise<boolean>;
  logger?: pino.Logger;
  // Solo para probar el modo producción (nombre de cookie y `Secure`); por defecto `NODE_ENV`.
  entorno?: 'development' | 'test' | 'production';
}

export function crearApp(deps: DependenciasApp): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.PROXY_SALTOS);
  app.set('entorno', deps.entorno ?? env.NODE_ENV);

  app.use(reqId());
  app.use(crearLogHttp(deps.logger ?? loggerGlobal));
  // Scalar (/api/docs) carga su bundle inline: la CSP se relaja solo ahí; el resto mantiene la de Helmet.
  const helmetPorDefecto = helmet();
  const helmetSinCsp = helmet({ contentSecurityPolicy: false });
  const seguridadCabeceras: RequestHandler = (req, res, next) =>
    (req.path === '/api/docs' ? helmetSinCsp : helmetPorDefecto)(req, res, next);
  app.use(seguridadCabeceras);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', csrf);

  app.use(crearRutaSalud(deps.comprobarBd));
  app.use(crearRutasAuth());
  app.use(crearRutasLegal());
  app.use(crearRutasUsuarios());
  app.use(crearRutasAuditoria());
  app.use(crearRutasDocs());

  app.use('/api', noEncontrado);
  app.use(manejadorErrores);
  return app;
}
