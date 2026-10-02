import { EVENTOS_AVISO, type Canal, type EventoAviso } from '../enums/aviso.js';

type CanalPreferencia = 'app' | 'telegram';

// Valores del diseño "Avisos": app todo activo; telegram activo salvo estado_ticket y seguimiento;
// el resumen diario solo va por Telegram.
export const PREFERENCIAS_POR_DEFECTO: Record<EventoAviso, Record<CanalPreferencia, boolean>> = {
  asignacion: { app: true, telegram: true },
  mencion: { app: true, telegram: true },
  vence_pronto: { app: true, telegram: true },
  vencio: { app: true, telegram: true },
  estado_ticket: { app: true, telegram: false },
  seguimiento: { app: true, telegram: false },
  cotizacion: { app: true, telegram: true },
  por_facturar: { app: true, telegram: true },
  resumen_diario: { app: false, telegram: true },
};

export type PreferenciasResueltas = Record<EventoAviso, Record<CanalPreferencia, boolean>>;

// Valor por defecto + filas explícitas; `correo` se ignora (siempre false, ADR 0013).
export function resolverPreferencias(
  filas: readonly { evento: EventoAviso; canal: Canal; activo: boolean }[],
): PreferenciasResueltas {
  const resueltas = {} as PreferenciasResueltas;
  for (const evento of EVENTOS_AVISO) resueltas[evento] = { ...PREFERENCIAS_POR_DEFECTO[evento] };
  for (const fila of filas) {
    if (fila.canal === 'correo') continue;
    if (fila.evento === 'resumen_diario' && fila.canal === 'app') continue;
    resueltas[fila.evento][fila.canal] = fila.activo;
  }
  return resueltas;
}
