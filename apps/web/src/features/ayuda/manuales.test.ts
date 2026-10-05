import fs from 'node:fs';
import path from 'node:path';
import { ROLES } from '@zydesk/shared';
import { expect, it } from 'vitest';
import { RUTAS_DE_IMAGENES, resolverImagen, rutaDeImagen } from './imagenes';
import { MANUALES, manualesDe, manualPorClave } from './manuales';
import { encabezadosDe } from './slug';

it('manualesDe devuelve los manuales de cada rol en el orden fijo', () => {
  expect(manualesDe('lectura').map((m) => m.clave)).toEqual(['primeros-pasos', 'bot-telegram']);
  expect(manualesDe('tecnico').map((m) => m.clave)).toEqual([
    'primeros-pasos',
    'tecnico',
    'bot-telegram',
  ]);
  expect(manualesDe('coordinacion').map((m) => m.clave)).toEqual([
    'primeros-pasos',
    'tecnico',
    'coordinacion',
    'bot-telegram',
  ]);
  expect(manualesDe('admin').map((m) => m.clave)).toEqual([
    'primeros-pasos',
    'tecnico',
    'coordinacion',
    'bot-telegram',
    'administracion',
  ]);
  expect(ROLES.every((r) => manualesDe(r).length >= 1)).toBe(true);
});

it('manualPorClave devuelve el manual o undefined', () => {
  expect(manualPorClave('tecnico')?.archivo).toBe('01-tecnico.md');
  expect(manualPorClave('no-existe')).toBeUndefined();
});

it('el título coincide con la primera línea `# ` del texto', () => {
  for (const m of MANUALES) {
    expect(m.texto.split(/\r?\n/).find((l) => l.startsWith('# '))).toBe(`# ${m.titulo}`);
  }
});

it('todo enlace .md y toda #ancla escritos en los manuales apuntan a algo que existe', () => {
  const rotos: string[] = [];
  for (const origen of MANUALES) {
    for (const [, crudo] of origen.texto.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = decodeURIComponent(crudo!);
      if (/^(https?:|mailto:)/i.test(href)) continue;
      const [ruta = '', ancla] = href.split('#');
      const destino = ruta ? MANUALES.find((m) => m.archivo === ruta.split('/').pop()) : origen;
      if (!destino) {
        if (ruta.endsWith('.md'))
          rotos.push(`${origen.archivo}: ${href} (archivo fuera del registro)`);
        continue;
      }
      if (ancla && !encabezadosDe(destino.texto).some((e) => e.id === ancla)) {
        rotos.push(`${origen.archivo}: ${href} (ancla inexistente)`);
      }
    }
  }
  expect(rotos).toEqual([]);
});

// Quita los bloques de código para no confundir ejemplos con imágenes reales.
const sinCodigo = (texto: string) => texto.replace(/```[\s\S]*?```/g, '');
const IMAGEN_MD = /!\[([^\]]*)\]\(([^)\s]*)\)/g;

it('toda imagen de los manuales tiene alt, ruta relativa y existe en el bundle', () => {
  const rotas: string[] = [];
  for (const m of MANUALES) {
    for (const [, alt, ruta] of sinCodigo(m.texto).matchAll(IMAGEN_MD)) {
      if (!alt!.trim()) rotas.push(`${m.archivo}: ${ruta} sin alt`);
      if (resolverImagen(m, ruta) === null) rotas.push(`${m.archivo}: ${ruta} no resuelve`);
    }
  }
  expect(rotas).toEqual([]);
});

it('ninguna captura de docs/manuales/img queda huérfana', () => {
  const referenciadas = new Set<string>();
  for (const m of MANUALES) {
    for (const [, , ruta] of sinCodigo(m.texto).matchAll(IMAGEN_MD)) {
      const r = rutaDeImagen(m, ruta);
      if (r) referenciadas.add(r);
    }
  }
  expect(RUTAS_DE_IMAGENES.filter((r) => !referenciadas.has(r))).toEqual([]);
});

it('cada captura pesa 350 KB o menos y la carpeta, 10 MB', () => {
  // Vitest corre con cwd en apps/web.
  const carpeta = path.resolve(process.cwd(), '../../docs/manuales');
  let total = 0;
  const pesadas: string[] = [];
  for (const ruta of RUTAS_DE_IMAGENES) {
    const bytes = fs.statSync(path.join(carpeta, ruta)).size;
    total += bytes;
    if (bytes > 350 * 1024) pesadas.push(`${ruta}: ${Math.round(bytes / 1024)} KB`);
  }
  expect(pesadas).toEqual([]);
  expect(total).toBeLessThanOrEqual(10 * 1024 * 1024);
});
