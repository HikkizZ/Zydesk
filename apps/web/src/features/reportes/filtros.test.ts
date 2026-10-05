import { expect, it } from 'vitest';
import {
  consultaDeParams,
  presetDeParams,
  rangoDePreset,
  sumarDias,
  textoPeriodo,
} from './filtros';

const HOY = '2026-10-04';

it('sumarDias cruza meses y años', () => {
  expect(sumarDias('2026-10-04', -30)).toBe('2026-09-04');
  expect(sumarDias('2026-01-02', -3)).toBe('2025-12-30');
});

it('rangoDePreset', () => {
  expect(rangoDePreset('este_mes', HOY)).toEqual({});
  expect(rangoDePreset('mes_anterior', HOY)).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
  expect(rangoDePreset('mes_anterior', '2026-01-15')).toEqual({
    desde: '2025-12-01',
    hasta: '2025-12-31',
  });
  expect(rangoDePreset('ultimos_30', HOY)).toEqual({ desde: '2026-09-04', hasta: HOY });
  expect(rangoDePreset('ultimos_90', HOY)).toEqual({ desde: '2026-07-06', hasta: HOY });
});

it('presetDeParams devuelve el preset que coincide o personalizado', () => {
  const de = (q: string) => presetDeParams(new URLSearchParams(q), HOY);
  expect(de('')).toBe('este_mes');
  expect(de('departamento=3')).toBe('este_mes');
  expect(de('desde=2026-09-01&hasta=2026-09-30')).toBe('mes_anterior');
  expect(de('desde=2026-09-04&hasta=2026-10-04')).toBe('ultimos_30');
  expect(de('desde=2026-07-06&hasta=2026-10-04')).toBe('ultimos_90');
  expect(de('desde=2026-09-10&hasta=2026-09-12')).toBe('personalizado');
  expect(de('desde=2026-09-10')).toBe('personalizado');
});

it('consultaDeParams traduce los parámetros de la URL y descarta los inválidos', () => {
  expect(
    consultaDeParams(
      new URLSearchParams('desde=2026-09-01&hasta=2026-09-30&departamento=3&cliente=7&usuario=2'),
    ),
  ).toEqual({
    desde: '2026-09-01',
    hasta: '2026-09-30',
    departamento_id: 3,
    cliente_id: 7,
    usuario_id: 2,
  });
  expect(consultaDeParams(new URLSearchParams('desde=x&departamento=0&cliente=abc'))).toEqual({});
});

it('textoPeriodo', () => {
  expect(textoPeriodo('2026-10-01', '2026-10-04')).toBe('del 1 al 4 de octubre de 2026');
  expect(textoPeriodo('2026-09-28', '2026-10-04')).toBe(
    'del 28 de septiembre al 4 de octubre de 2026',
  );
  expect(textoPeriodo('2025-12-28', '2026-01-04')).toBe(
    'del 28 de diciembre de 2025 al 4 de enero de 2026',
  );
  expect(textoPeriodo('2026-10-04', '2026-10-04')).toBe('del 4 de octubre de 2026');
});
