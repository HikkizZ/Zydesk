import pino, { type DestinationStream } from 'pino';
import { contexto } from '../core/http/contexto.js';
import { env } from './env.js';
import { VERSION } from './version.js';

export const CLAVES_REDACTADAS = [
  'password',
  'contrasena',
  'cookie',
  'set-cookie',
  'authorization',
  'token',
  'codigo',
];

// pino: claves con guion van como ["clave"]; sin guion como .clave
const paths = CLAVES_REDACTADAS.flatMap((k) => {
  const acceso = (prefijo: string) =>
    prefijo === ''
      ? k.includes('-')
        ? `["${k}"]`
        : k
      : k.includes('-')
        ? `${prefijo}["${k}"]`
        : `${prefijo}.${k}`;
  return [acceso(''), acceso('*'), acceso('*.*'), acceso('req.headers'), acceso('res.headers')];
});

export function crearLogger(opciones: {
  nivel: string;
  entorno: string;
  version: string;
  bonito: boolean;
  destino?: DestinationStream;
}): pino.Logger {
  const config: pino.LoggerOptions = {
    level: opciones.nivel,
    base: { servicio: 'api', version: opciones.version, entorno: opciones.entorno },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (etiqueta) => ({ level: etiqueta }) },
    messageKey: 'msg',
    errorKey: 'err',
    mixin: () => contexto.getStore() ?? {},
    redact: { paths, censor: '[Redactado]' },
  };
  if (opciones.bonito) {
    return pino({
      ...config,
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:HH:MM:ss', ignore: 'servicio,version,entorno' },
      },
    });
  }
  return opciones.destino ? pino(config, opciones.destino) : pino(config);
}

export const logger = crearLogger({
  nivel: env.LOG_LEVEL ?? (env.NODE_ENV === 'development' ? 'debug' : 'info'),
  entorno: env.NODE_ENV,
  version: VERSION,
  bonito: env.NODE_ENV === 'development',
});
