import { describe, expect, it } from 'vitest';
import { estadoPlazo } from './franja.js';

const LIMITE = '2026-10-09T15:00:00.000Z';
const base = { fecha_limite: LIMITE, cerrado_en: null, vencido: false, plazo_habil: null };
const plazo = (total: number, restantes: number) => ({ total, restantes });

describe('estadoPlazo', () => {
  const casos: [string, Parameters<typeof estadoPlazo>[0], ReturnType<typeof estadoPlazo>][] = [
    [
      'sin fecha límite',
      { ...base, fecha_limite: null, plazo_habil: plazo(16, 6) },
      { tono: 'neutro', fraccion: null, resuelto: false, en_plazo: null },
    ],
    [
      'cerrado dentro de plazo',
      { ...base, cerrado_en: '2026-10-08T15:00:00.000Z', plazo_habil: plazo(16, 4) },
      { tono: 'neutro', fraccion: 0.25, resuelto: true, en_plazo: true },
    ],
    [
      'cerrado fuera de plazo',
      { ...base, cerrado_en: '2026-10-10T15:00:00.000Z', plazo_habil: plazo(16, -3) },
      { tono: 'neutro', fraccion: 0, resuelto: true, en_plazo: false },
    ],
    [
      'cerrado sin plazo_habil',
      { ...base, cerrado_en: '2026-10-08T15:00:00.000Z' },
      { tono: 'neutro', fraccion: null, resuelto: true, en_plazo: null },
    ],
    [
      'abierto al 90 %',
      { ...base, plazo_habil: plazo(20, 18) },
      { tono: 'ok', fraccion: 0.9, resuelto: false, en_plazo: null },
    ],
    [
      'abierto en el 25 % exacto',
      { ...base, plazo_habil: plazo(16, 4) },
      { tono: 'atento', fraccion: 0.25, resuelto: false, en_plazo: null },
    ],
    [
      'abierto al 24 %',
      { ...base, plazo_habil: plazo(25, 6) },
      { tono: 'atento', fraccion: 0.24, resuelto: false, en_plazo: null },
    ],
    [
      'abierto al 26 % (sigue verde)',
      { ...base, plazo_habil: plazo(50, 13) },
      { tono: 'ok', fraccion: 0.26, resuelto: false, en_plazo: null },
    ],
    [
      'vencido por horas hábiles negativas',
      { ...base, plazo_habil: plazo(16, -2) },
      { tono: 'vencido', fraccion: 0, resuelto: false, en_plazo: null },
    ],
    [
      'vencido por bandera sin plazo_habil',
      { ...base, vencido: true },
      { tono: 'vencido', fraccion: null, resuelto: false, en_plazo: null },
    ],
    [
      'total 0: sin proporción',
      { ...base, plazo_habil: plazo(0, 3) },
      { tono: 'ok', fraccion: null, resuelto: false, en_plazo: null },
    ],
    [
      'fracción acotada a 1',
      { ...base, plazo_habil: plazo(8, 12) },
      { tono: 'ok', fraccion: 1, resuelto: false, en_plazo: null },
    ],
  ];
  it.each(casos)('%s', (_nombre, entrada, esperado) => {
    expect(estadoPlazo(entrada)).toEqual(esperado);
  });
});
