// Estado de la franja de plazo hábil (fase 10, §5.4): función pura que comparten web y, a futuro, el bot.
export type TonoPlazo = 'ok' | 'atento' | 'vencido' | 'neutro';

export interface EstadoPlazo {
  tono: TonoPlazo;
  /** restantes/total acotado a [0, 1]; null sin plazo_habil o con total ≤ 0 */
  fraccion: number | null;
  /** cerrado_en no nulo */
  resuelto: boolean;
  /** solo con resuelto: restantes ≥ 0; null si no se conoce (sin plazo_habil) */
  en_plazo: boolean | null;
}

/** Bajo este umbral de horas hábiles restantes (sobre el total) el tono pasa a ámbar. */
export const UMBRAL_PLAZO_ATENTO = 0.25;

export function estadoPlazo(t: {
  fecha_limite: string | null;
  cerrado_en: string | null;
  vencido: boolean;
  plazo_habil: { total: number; restantes: number } | null;
}): EstadoPlazo {
  const p = t.plazo_habil;
  const fraccion = p && p.total > 0 ? Math.min(1, Math.max(0, p.restantes / p.total)) : null;
  if (t.fecha_limite === null) {
    return { tono: 'neutro', fraccion: null, resuelto: t.cerrado_en !== null, en_plazo: null };
  }
  if (t.cerrado_en !== null) {
    return { tono: 'neutro', fraccion, resuelto: true, en_plazo: p ? p.restantes >= 0 : null };
  }
  if (t.vencido || (p !== null && p.restantes < 0)) {
    return { tono: 'vencido', fraccion, resuelto: false, en_plazo: null };
  }
  if (fraccion !== null && fraccion <= UMBRAL_PLAZO_ATENTO) {
    return { tono: 'atento', fraccion, resuelto: false, en_plazo: null };
  }
  return { tono: 'ok', fraccion, resuelto: false, en_plazo: null };
}
