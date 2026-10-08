// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const carpetaEstilos = fileURLToPath(new URL('.', import.meta.url));
const carpetaSrc = join(carpetaEstilos, '..');
const css = readFileSync(join(carpetaEstilos, 'tema.css'), 'utf8');

type Rgb = [number, number, number];

/** Valor de `--color-<nombre>` dentro del primer `@theme` (hex o `rgb(r g b / a)`). */
function color(nombre: string): { rgb: Rgb; alfa: number } {
  const m = new RegExp(`--color-${nombre}:\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`Falta el token --color-${nombre}`);
  const valor = m[1]!.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(valor);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alfa: 1 };
  }
  const f = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*[/,]\s*([\d.]+)\s*\)$/.exec(valor);
  if (f) return { rgb: [Number(f[1]), Number(f[2]), Number(f[3])], alfa: Number(f[4]) };
  throw new Error(`Formato no soportado en --color-${nombre}: ${valor}`);
}

/** Color opaco; si tiene alfa se compone sobre `fondo`. */
function opaco(nombre: string, fondo: Rgb = [255, 255, 255]): Rgb {
  const { rgb, alfa } = color(nombre);
  return rgb.map((c, i) => Math.round(c * alfa + fondo[i]! * (1 - alfa))) as Rgb;
}

function luminancia([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contraste(a: Rgb, b: Rgb): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro! + 0.05) / (oscuro! + 0.05);
}

const BLANCO: Rgb = [255, 255, 255];
const fondos = ['panel', 'lienzo', 'panel-hundido', 'acento-suave'] as const;

// [texto, fondos base sobre los que se usa, fondo suave propio]
const textos: [string, readonly (typeof fondos)[number][], string?][] = [
  ['tinta', fondos],
  ['tinta-2', fondos],
  ['tinta-3', fondos],
  ['acento', fondos],
  ['plazo-ok', ['panel', 'lienzo', 'panel-hundido'], 'plazo-ok-suave'],
  ['plazo-atento', ['panel', 'lienzo', 'panel-hundido'], 'plazo-atento-suave'],
  ['plazo-vencido', ['panel', 'lienzo', 'panel-hundido'], 'plazo-vencido-suave'],
  ['estado-nuevo', ['panel', 'lienzo', 'panel-hundido']],
  ['interna', ['panel', 'lienzo', 'panel-hundido'], 'interna-suave'],
];

const pares = textos.flatMap(([texto, bases, propio]) => [
  ...bases.map((f) => [texto, f] as const),
  ...(propio ? [[texto, propio] as const] : []),
]);

describe('contraste AA de los tokens (spec fase 10 §3.3)', () => {
  it.each(pares)('%s sobre %s ≥ 4,5:1', (texto, fondo) => {
    const ratio = contraste(opaco(texto), opaco(fondo));
    expect(ratio, `${texto} sobre ${fondo}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });

  it('blanco sobre acento ≥ 4,5:1', () => {
    expect(contraste(BLANCO, opaco('acento'))).toBeGreaterThanOrEqual(4.5);
  });

  it('linea-campo sobre panel ≥ 3:1 (WCAG 1.4.11)', () => {
    expect(contraste(opaco('linea-campo', opaco('panel')), opaco('panel'))).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('tinta-4 es solo decorativo: no pasa AA como texto', () => {
    expect(contraste(opaco('tinta-4'), opaco('panel'))).toBeLessThan(4.5);
  });
});

function archivosTsx(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) return archivosTsx(ruta);
    return e.name.endsWith('.tsx') ? [ruta] : [];
  });
}

describe('tinta-4 no se usa como texto', () => {
  it('ninguna clase text-tinta-4 sin aria-hidden en el mismo elemento', () => {
    const infractores: string[] = [];
    for (const ruta of archivosTsx(carpetaSrc)) {
      const fuente = readFileSync(ruta, 'utf8');
      for (const m of fuente.matchAll(/text-tinta-4/g)) {
        const ini = fuente.lastIndexOf('<', m.index);
        const fin = fuente.indexOf('>', m.index);
        const etiqueta = fuente.slice(ini, fin + 1);
        if (!/aria-hidden/.test(etiqueta)) infractores.push(`${ruta}:${m.index}`);
      }
    }
    expect(infractores).toEqual([]);
  });
});
