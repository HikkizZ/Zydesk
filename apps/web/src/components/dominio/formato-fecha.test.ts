import { expect, it } from 'vitest';
import {
  diaMes,
  diaMesHora,
  diaMesHoraCorto,
  diaSemanaCorto,
  horaCorta,
} from '@/components/dominio/formato-fecha';

// 2026-10-07 es miércoles; 15:00Z = 12:00 en Santiago (UTC-3 en octubre).
const MIE_MEDIODIA = '2026-10-07T15:00:00.000Z';

it('diaSemanaCorto usa el día de Santiago, no el de UTC', () => {
  expect(diaSemanaCorto(MIE_MEDIODIA)).toBe('mié');
  // 01:00Z del jueves 8 sigue siendo miércoles 7 a las 22:00 en Santiago.
  expect(diaSemanaCorto('2026-10-08T01:00:00.000Z')).toBe('mié');
});

it('horaCorta y diaMesHoraCorto escriben la hora de Santiago', () => {
  expect(horaCorta(MIE_MEDIODIA)).toBe('12:00');
  expect(diaMesHoraCorto(MIE_MEDIODIA)).toBe('mié 7 oct 12:00');
  expect(diaMesHora(MIE_MEDIODIA)).toBe('7 oct 12:00');
  expect(diaMes(MIE_MEDIODIA)).toBe('7 oct');
});
