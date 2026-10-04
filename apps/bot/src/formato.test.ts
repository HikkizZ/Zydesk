import { describe, expect, it } from 'vitest';
import { escaparHtml, fechaCorta, fechaHoraCorta, recortar } from './formato.js';

describe('formato', () => {
  it('escaparHtml neutraliza etiquetas y ampersands', () => {
    expect(escaparHtml('<img src="x"> & <b>')).toBe('&lt;img src="x"&gt; &amp; &lt;b&gt;');
  });

  it('recortar colapsa espacios y agrega …', () => {
    expect(recortar('a  b\nc', 10)).toBe('a b c');
    expect(recortar('abcdefghij', 5)).toBe('abcd…');
  });

  it('fechas en Santiago', () => {
    expect(fechaCorta('2026-09-30T15:00:00Z')).toBe('30 sep');
    expect(fechaHoraCorta('2026-10-01T13:15:00Z')).toBe('1 oct 10:15');
    // la 01:00 UTC aún es el día anterior en Santiago
    expect(fechaCorta('2026-10-01T01:00:00Z')).toBe('30 sep');
  });
});
