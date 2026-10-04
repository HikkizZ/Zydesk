import pino, { type DestinationStream } from 'pino';

// ADR 0017: solo ids. Nunca el texto de los mensajes de Telegram, el chat_id ni secretos.
export const CLAVES_REDACTADAS = [
  'token',
  'authorization',
  'codigo',
  'chat_id',
  'text',
  'x-bot-key',
];

const acceso = (prefijo: string, k: string) =>
  prefijo === ''
    ? k.includes('-')
      ? `["${k}"]`
      : k
    : k.includes('-')
      ? `${prefijo}["${k}"]`
      : `${prefijo}.${k}`;
const paths = CLAVES_REDACTADAS.flatMap((k) => [
  acceso('', k),
  acceso('*', k),
  acceso('*.*', k),
  acceso('headers', k),
]);

// Los errores de red de grammY pueden traer la URL de la Bot API (que lleva el token).
const PATRON_URL_BOT = /bot\d+:[\w-]+/g;

export function errorSeguro(err: unknown): { name: string; message: string } {
  const e = err instanceof Error ? err : new Error(String(err));
  return { name: e.name, message: e.message.replace(PATRON_URL_BOT, 'bot[Redactado]') };
}

export function crearLogger(opciones: {
  nivel: string;
  entorno: string;
  version: string;
  bonito?: boolean;
  destino?: DestinationStream;
}): pino.Logger {
  const config: pino.LoggerOptions = {
    level: opciones.nivel,
    base: { servicio: 'bot', version: opciones.version, entorno: opciones.entorno },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (etiqueta) => ({ level: etiqueta }) },
    messageKey: 'msg',
    errorKey: 'err',
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
