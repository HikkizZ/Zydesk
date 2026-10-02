import { expect, it } from 'vitest';
import { crearGeneradorIds, encabezadosDe, slug } from './slug';

it('slug sigue el algoritmo de GitHub para los ejemplos de los manuales', () => {
  expect(slug('Registrar horas')).toBe('registrar-horas');
  expect(slug('Por aprobar en Mi día')).toBe('por-aprobar-en-mi-día');
  expect(slug('Exportar para facturación (.xlsx)')).toBe('exportar-para-facturación-xlsx');
  expect(slug('1. Primer ingreso y primer usuario')).toBe('1-primer-ingreso-y-primer-usuario');
  expect(slug('Menciones')).toBe('menciones');
});

it('slug ignora los acentos graves del código', () => {
  expect(slug('Usar `npm run dev` hoy')).toBe('usar-npm-run-dev-hoy');
});

it('los duplicados llevan -1 y -2', () => {
  const id = crearGeneradorIds();
  expect([id('Notas'), id('Notas'), id('Notas')]).toEqual(['notas', 'notas-1', 'notas-2']);
});

it('encabezadosDe ignora los bloques de código y cuenta todos los niveles para los duplicados', () => {
  const md = ['# Notas', '```', '## No', '```', '## Notas', '### Más'].join('\n');
  expect(encabezadosDe(md)).toEqual([
    { nivel: 1, texto: 'Notas', id: 'notas' },
    { nivel: 2, texto: 'Notas', id: 'notas-1' },
    { nivel: 3, texto: 'Más', id: 'más' },
  ]);
});
