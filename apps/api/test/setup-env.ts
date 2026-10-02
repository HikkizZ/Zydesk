// Debe cargarse antes que cualquier módulo que importe `config/env.ts`: el `.env` local puede no traer
// `BOT_API_KEY` (CI copia `.env.example`, que sí la trae).
process.env['BOT_API_KEY'] ||= 'clave-de-desarrollo-cambiar-en-produccion';
