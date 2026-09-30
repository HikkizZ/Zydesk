import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { MenuLateral } from './MenuLateral';
import { MENU } from './menu';

const TEXTOS_COMUNES = [
  'Nuevo ticket',
  'Mi día',
  'Avisos',
  'Tablero',
  'Tabla',
  'Línea de tiempo',
  'Órdenes de trabajo',
  'Cotizador',
  'Horas',
  'Reportes',
  'Clientes',
];

it('un administrador ve todas las entradas, incluida Configuración', () => {
  render(
    <ConSesion yo={yoDePrueba({ rol: 'admin' })}>
      <MenuLateral />
    </ConSesion>,
  );
  for (const texto of [...TEXTOS_COMUNES, 'Configuración']) {
    expect(screen.getByText(texto)).toBeTruthy();
  }
});

it('un técnico no ve Configuración (el resto sí)', () => {
  render(
    <ConSesion yo={yoDePrueba({ rol: 'tecnico' })}>
      <MenuLateral />
    </ConSesion>,
  );
  expect(screen.queryByText('Configuración')).toBeNull();
  for (const texto of TEXTOS_COMUNES) {
    expect(screen.getByText(texto)).toBeTruthy();
  }
});

it('muestra el nombre de la app, la persona y la etiqueta de su rol', () => {
  render(
    <ConSesion yo={yoDePrueba({ rol: 'coordinacion', nombre_app: 'Mi Mesa' })}>
      <MenuLateral />
    </ConSesion>,
  );
  expect(screen.getByText('Mi Mesa')).toBeTruthy();
  expect(screen.getByText('Diego Muñoz')).toBeTruthy();
  expect(screen.getByText('Coordinación')).toBeTruthy();
  expect(screen.getByText('DM')).toBeTruthy();
});

it('menu.ts tiene 13 entradas con rutas únicas y solo Configuración exige permiso', () => {
  expect(MENU).toHaveLength(13);
  expect(new Set(MENU.map((e) => e.ruta)).size).toBe(13);
  expect(MENU.filter((e) => e.permiso).map((e) => e.etiqueta)).toEqual(['Configuración']);
});
