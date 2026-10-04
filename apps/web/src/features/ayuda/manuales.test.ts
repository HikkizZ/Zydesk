import { ROLES } from '@zydesk/shared';
import { expect, it } from 'vitest';
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
