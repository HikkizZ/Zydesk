import { describe, expect, it } from 'vitest';
import {
  calcularCotizacion,
  convertirTarifa,
  enClp,
  totalLinea,
  venceEl,
  type LineaCalculo,
  type TarifaConMoneda,
} from './calcular.js';
import { formatearMonto, formatearValorUf } from '../formato/moneda.js';

const l = (cantidad: number, precio_unitario: number, descuento_pct = 0): LineaCalculo => ({
  cantidad,
  precio_unitario,
  descuento_pct,
});
const clp = { moneda: 'CLP', aplica_iva: true, iva_pct: 19 } as const;
const uf = { moneda: 'UF', aplica_iva: true, iva_pct: 19 } as const;

const diseno = [l(3, 38000), l(4, 38000), l(2, 45000), l(1, 38000), l(1, 90000, 10)];

describe('calcularCotizacion', () => {
  it.each([
    [
      'diseño COT-0218',
      diseno,
      clp,
      {
        lineas: [114000, 152000, 90000, 38000, 81000],
        subtotal: 484000,
        descuentos: 9000,
        neto: 475000,
        iva: 90250,
        total: 565250,
      },
    ],
    [
      'mismo sin IVA',
      diseno,
      { ...clp, aplica_iva: false },
      {
        lineas: [114000, 152000, 90000, 38000, 81000],
        subtotal: 484000,
        descuentos: 9000,
        neto: 475000,
        iva: 0,
        total: 475000,
      },
    ],
    [
      'half-up CLP',
      [l(1.5, 33333)],
      clp,
      { lineas: [50000], subtotal: 50000, descuentos: 0, neto: 50000, iva: 9500, total: 59500 },
    ],
    [
      'half-up CLP con descuento',
      [l(1, 1000, 33.33)],
      clp,
      { lineas: [667], subtotal: 1000, descuentos: 333, neto: 667, iva: 127, total: 794 },
    ],
    [
      '.005 en UF',
      [l(1, 1.005)],
      { ...uf, aplica_iva: false },
      { lineas: [1.01], subtotal: 1.01, descuentos: 0, neto: 1.01, iva: 0, total: 1.01 },
    ],
    [
      'UF',
      [l(2.5, 1.333)],
      uf,
      { lineas: [3.33], subtotal: 3.33, descuentos: 0, neto: 3.33, iva: 0.63, total: 3.96 },
    ],
    [
      'redondeo por línea, no al final',
      [l(1, 0.5), l(1, 0.5), l(1, 0.5)],
      { ...clp, aplica_iva: false },
      { lineas: [1, 1, 1], subtotal: 3, descuentos: 0, neto: 3, iva: 0, total: 3 },
    ],
    ['sin líneas', [], clp, { lineas: [], subtotal: 0, descuentos: 0, neto: 0, iva: 0, total: 0 }],
    [
      'descuento 100 %',
      [l(2, 1000, 100)],
      clp,
      { lineas: [0], subtotal: 2000, descuentos: 2000, neto: 0, iva: 0, total: 0 },
    ],
  ])('%s', (_caso, lineas, params, esperado) => {
    expect(calcularCotizacion(lineas, params)).toEqual(esperado);
  });
});

describe('enClp', () => {
  it('convierte UF a pesos redondeando', () => {
    expect(enClp(10, 'UF', 38000.5)).toBe(380005);
  });
  it('CLP queda igual', () => {
    expect(enClp(1234, 'CLP', null)).toBe(1234);
  });
  it('UF sin valor_uf es null', () => {
    expect(enClp(10, 'UF', null)).toBeNull();
  });
});

describe('venceEl', () => {
  it.each([
    ['2026-09-29', 30, '2026-10-29'],
    ['2026-09-29', 15, '2026-10-14'],
  ] as const)('%s + %s días -> %s', (fecha, dias, esperado) => {
    expect(venceEl(fecha, dias)).toBe(esperado);
  });
});

describe('formatearMonto', () => {
  it.each([
    [565250, 'CLP', '$565.250'],
    [12.5, 'UF', 'UF 12,50'],
    [0, 'UF', 'UF 0,00'],
    [-1, 'UF', '-UF 1,00'],
  ] as const)('%s %s -> %s', (n, moneda, esperado) => {
    expect(formatearMonto(n, moneda)).toBe(esperado);
  });
});

describe('convertirTarifa (UF 41098,15)', () => {
  const uf_valor = 41098.15;
  const clp38: TarifaConMoneda = { moneda: 'CLP', valor: 38000 };
  const uf08: TarifaConMoneda = { moneda: 'UF', valor: 0.8 };
  it.each([
    ['misma moneda CLP', clp38, 'CLP', uf_valor, 38000],
    ['misma moneda UF', uf08, 'UF', uf_valor, 0.8],
    ['UF a CLP (caso del usuario)', uf08, 'CLP', uf_valor, 32879],
    ['UF 1,00 a CLP', { moneda: 'UF', valor: 1 }, 'CLP', uf_valor, 41098],
    ['CLP 38000 a UF', clp38, 'UF', uf_valor, 0.92],
    ['CLP 45000 a UF', { moneda: 'CLP', valor: 45000 }, 'UF', uf_valor, 1.09],
    ['CLP 90000 a UF (precio fijo)', { moneda: 'CLP', valor: 90000 }, 'UF', uf_valor, 2.19],
    ['sin valor UF, hace falta', uf08, 'CLP', null, null],
    ['sin valor UF, no hace falta', clp38, 'CLP', null, 38000],
    ['cero', { moneda: 'UF', valor: 0 }, 'CLP', uf_valor, 0],
  ] as const)('%s', (_caso, t, destino, valor, esperado) => {
    expect(convertirTarifa(t, destino, valor)).toBe(esperado);
  });

  it('línea completa tras convertir', () => {
    const pClp = convertirTarifa(uf08, 'CLP', uf_valor)!;
    expect(totalLinea(l(3, pClp), 'CLP')).toBe(98637);
    const pUf = convertirTarifa(clp38, 'UF', uf_valor)!;
    expect(totalLinea(l(3, pUf), 'UF')).toBe(2.76);
  });

  it('diseño COT-0218 en UF con tarifas globales convertidas', () => {
    const p38 = convertirTarifa(clp38, 'UF', uf_valor)!;
    const p45 = convertirTarifa({ moneda: 'CLP', valor: 45000 }, 'UF', uf_valor)!;
    const p90 = convertirTarifa({ moneda: 'CLP', valor: 90000 }, 'UF', uf_valor)!;
    expect([p38, p45, p90]).toEqual([0.92, 1.09, 2.19]);
    const r = calcularCotizacion([l(3, p38), l(4, p38), l(2, p45), l(1, p38), l(1, p90, 10)], uf);
    expect(r).toMatchObject({
      subtotal: 11.73,
      descuentos: 0.22,
      neto: 11.51,
      iva: 2.19,
      total: 13.7,
    });
    expect(enClp(r.neto, 'UF', uf_valor)).toBe(473040);
  });
});

describe('formatearValorUf', () => {
  it.each([
    [41098.15, '$41.098,15'],
    [41098, '$41.098,00'],
  ])('%s -> %s', (n, esperado) => {
    expect(formatearValorUf(n)).toBe(esperado);
  });
});
