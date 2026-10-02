import { expect, it } from 'vitest';
import { resolverEnlace } from './enlaces';

it('#ancla es una ancla de la misma página', () => {
  expect(resolverEnlace('#registrar-horas')).toEqual({ tipo: 'ancla', href: '#registrar-horas' });
});

it('un .md del registro va a /ayuda/<clave>, con o sin ancla y con cualquier prefijo', () => {
  for (const href of ['01-tecnico.md', 'usuario/01-tecnico.md', './01-tecnico.md']) {
    expect(resolverEnlace(href)).toEqual({ tipo: 'interno', to: '/ayuda/tecnico' });
  }
  expect(resolverEnlace('02-coordinacion.md#por-aprobar-en-mi-día')).toEqual({
    tipo: 'interno',
    to: '/ayuda/coordinacion#por-aprobar-en-mi-día',
  });
  expect(resolverEnlace('usuario/00-primeros-pasos.md#avisos')).toEqual({
    tipo: 'interno',
    to: '/ayuda/primeros-pasos#avisos',
  });
  expect(resolverEnlace('../administracion.md')).toEqual({
    tipo: 'interno',
    to: '/ayuda/administracion',
  });
});

it('un .md fuera del registro es texto plano', () => {
  expect(resolverEnlace('../api/README.md')).toEqual({ tipo: 'texto' });
});

it('http, https y mailto son externos', () => {
  for (const href of ['http://a.cl', 'https://a.cl/x', 'mailto:a@b.cl']) {
    expect(resolverEnlace(href)).toEqual({ tipo: 'externo', href });
  }
});

it('cualquier otro es una ruta interna', () => {
  expect(resolverEnlace('/api/docs')).toEqual({ tipo: 'interno', to: '/api/docs' });
});
