import path from 'node:path';
import { GrammyError } from 'grammy';
import { ClienteZydesk } from './api/cliente.js';
import { COMANDOS, crearBot } from './bot.js';
import { advertenciaApiUrl, cargarEnv, raizRepo } from './config/env.js';
import { crearLogger, errorSeguro } from './config/logger.js';
import { VERSION } from './config/version.js';
import { AlmacenSesiones } from './sesiones/almacen.js';

try {
  process.loadEnvFile(path.join(raizRepo, '.env'));
} catch {
  // sin .env: se usa el entorno del proceso
}

const env = cargarEnv();
const logger = crearLogger({
  nivel: env.LOG_LEVEL ?? (env.NODE_ENV === 'development' ? 'debug' : 'info'),
  entorno: env.NODE_ENV,
  version: VERSION,
  bonito: env.NODE_ENV === 'development',
});

if (!env.habilitado) {
  // `npm run dev` arranca el bot siempre; sin token termina en silencio (spec fase 6 §25.16)
  logger.info('bot deshabilitado: falta TELEGRAM_BOT_TOKEN');
  setTimeout(() => process.exit(0), 100);
} else {
  const advertencia = advertenciaApiUrl(env.API_URL);
  if (advertencia) logger.warn(advertencia);

  const almacen = new AlmacenSesiones({
    dir: env.BOT_DATOS_DIR,
    clave: env.BOT_CLAVE_CIFRADO,
    logger,
  });
  const bot = crearBot({
    token: env.TELEGRAM_BOT_TOKEN,
    api: new ClienteZydesk({ apiUrl: env.API_URL, botKey: env.BOT_API_KEY }),
    almacen,
    logger,
    webUrl: env.WEB_URL,
  });

  let detenido = false;
  const apagar = () => {
    if (detenido) return;
    detenido = true;
    logger.info('apagando el bot');
    void bot.stop().finally(() => process.exit(0));
  };
  process.once('SIGTERM', apagar);
  process.once('SIGINT', apagar);

  // Long polling básico con reintentos y espera creciente (máx. 60 s)
  let espera = 2_000;
  while (!detenido) {
    try {
      await bot.start({
        onStart: () => {
          espera = 2_000;
          logger.info('bot iniciado');
          bot.api.setMyCommands(COMANDOS).catch((err) => {
            logger.warn({ err: errorSeguro(err) }, 'no pude registrar los comandos');
          });
        },
      });
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 401) {
        logger.error('Telegram rechazó el token del bot; revisa TELEGRAM_BOT_TOKEN');
        process.exit(1);
      }
      logger.error({ err: errorSeguro(err) }, 'el long polling se cortó; reintento');
    }
    if (detenido) break;
    await new Promise((r) => setTimeout(r, espera));
    espera = Math.min(espera * 2, 60_000);
  }
}
