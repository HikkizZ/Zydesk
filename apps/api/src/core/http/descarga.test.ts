import { describe, expect, it } from 'vitest';
import { contentDisposition } from './descarga.js';

describe('contentDisposition', () => {
  it('reemplaza barra invertida, comillas, punto y coma y barra por _', () => {
    expect(contentDisposition('attachment', String.raw`x\y`)).toContain('filename="x_y";');
    expect(contentDisposition('attachment', 'a"b;c/d')).toContain('filename="a_b_c_d";');
  });
});
