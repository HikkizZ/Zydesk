import { expect, it } from 'vitest';
import { resolverImagen } from './imagenes';
import { manualPorClave } from './manuales';

const tecnico = manualPorClave('tecnico')!;
const administracion = manualPorClave('administracion')!;

it('resuelve una captura real del bundle desde usuario/ y desde la raíz', () => {
  expect(resolverImagen(tecnico, '../img/tecnico/detalle-ticket.png')).toMatch(/\.png/);
  expect(resolverImagen(administracion, 'img/administracion/equipo.png')).toMatch(/\.png/);
});

it('devuelve null si falta, no existe o apunta a otra carpeta equivocada', () => {
  expect(resolverImagen(tecnico, undefined)).toBeNull();
  expect(resolverImagen(tecnico, '../img/tecnico/no-existe.png')).toBeNull();
  // Desde `usuario/`, `img/...` apuntaría a `usuario/img/...`, que no existe.
  expect(resolverImagen(tecnico, 'img/tecnico/detalle-ticket.png')).toBeNull();
});

it.each([
  'https://evil/x.png',
  '//evil/x.png',
  '/img/tecnico/detalle-ticket.png',
  'data:image/png;base64,AAAA',
  'javascript:alert(1)',
  '../../../.env',
  '../../x.png',
  '..\img\tecnico\detalle-ticket.png',
])('rechaza %s', (src) => {
  expect(resolverImagen(tecnico, src)).toBeNull();
});

it('rechaza una ruta que sale de docs/manuales desde la raíz', () => {
  expect(resolverImagen(administracion, 'img/../../README.md')).toBeNull();
  expect(resolverImagen(administracion, '../README.md')).toBeNull();
});
