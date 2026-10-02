import { expect, it } from 'vitest';
import { diasDePrueba } from '@/test/linea-tiempo';
import {
  consultaDeEscala,
  desdePorDefecto,
  lunesDeSemana,
  moverRango,
  rangoDeEscala,
  sumarMeses,
} from './rango';

it('2 semanas pide 20 días y dibuja exactamente 10 hábiles', () => {
  const dias = diasDePrueba('2026-09-28', 21, '2026-09-29');
  expect(consultaDeEscala('2semanas', '2026-09-28')).toEqual({
    desde: '2026-09-28',
    hasta: '2026-10-18',
  });
  const r = rangoDeEscala('2semanas', '2026-09-28', dias);
  expect(r.columnas).toHaveLength(10);
  expect(r.columnas[0]?.fecha).toBe('2026-09-28');
  expect(r.hasta).toBe('2026-10-09');
});

it('2 semanas cruzando el año y con un feriado sigue siendo 10 hábiles', () => {
  const dias = diasDePrueba('2026-12-28', 21, '2026-12-29').map((d) =>
    d.fecha === '2027-01-01' ? { ...d, habil: false, feriado: 'Año Nuevo' } : d,
  );
  const r = rangoDeEscala('2semanas', '2026-12-28', dias);
  expect(r.columnas).toHaveLength(10);
  expect(r.columnas.some((c) => c.fecha === '2027-01-01')).toBe(false);
  expect(r.hasta).toBe('2027-01-11');
});

it('mes va del 1 al último día y solo dibuja hábiles', () => {
  expect(consultaDeEscala('mes', '2026-10-01')).toEqual({
    desde: '2026-10-01',
    hasta: '2026-10-31',
  });
  const dias = diasDePrueba('2026-10-01', 31, '2026-10-02');
  const r = rangoDeEscala('mes', '2026-10-01', dias);
  expect(r.hasta).toBe('2026-10-31');
  expect(r.columnas).toHaveLength(22);
});

it('día es un solo día y vacío si no es hábil', () => {
  expect(consultaDeEscala('dia', '2026-10-03')).toEqual({
    desde: '2026-10-03',
    hasta: '2026-10-03',
  });
  const dias = diasDePrueba('2026-10-01', 5, '2026-10-01');
  expect(rangoDeEscala('dia', '2026-10-01', dias).columnas).toHaveLength(1);
  expect(rangoDeEscala('dia', '2026-10-03', dias).columnas).toHaveLength(0);
});

it('lunes por defecto, meses y navegación', () => {
  expect(lunesDeSemana('2026-10-01')).toBe('2026-09-28');
  expect(lunesDeSemana('2026-09-28')).toBe('2026-09-28');
  expect(desdePorDefecto('2semanas', '2026-10-01')).toBe('2026-09-28');
  expect(desdePorDefecto('mes', '2026-10-15')).toBe('2026-10-01');
  expect(desdePorDefecto('dia', '2026-10-15')).toBe('2026-10-15');
  expect(sumarMeses('2026-12-01', 1)).toBe('2027-01-01');
  expect(moverRango('2semanas', '2026-09-28', 1)).toBe('2026-10-12');
  expect(moverRango('mes', '2026-10-01', -1)).toBe('2026-09-01');
  // el viernes siguiente es lunes; el lunes anterior es viernes
  expect(moverRango('dia', '2026-10-02', 1)).toBe('2026-10-05');
  expect(moverRango('dia', '2026-10-05', -1)).toBe('2026-10-02');
});
