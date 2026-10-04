// Debe cargarse antes que cualquier módulo que importe `config/env.ts`: el `.env` local puede no traer
// `BOT_API_KEY` (CI copia `.env.example`, que sí la trae).
process.env['BOT_API_KEY'] ||= 'clave-de-desarrollo-cambiar-en-produccion';

// El `.env` del desarrollador puede traer un bot real: los tests parten sin Telegram (cadena vacía = definida,
// así `dotenv` no la rellena desde el `.env`) y fijan lo que necesiten con `fijarEnv`.
process.env['TELEGRAM_BOT_TOKEN'] = '';
process.env['TELEGRAM_BOT_USUARIO'] = '';
