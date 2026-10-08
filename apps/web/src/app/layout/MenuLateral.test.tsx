import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { MenuLateral } from './MenuLateral';
import { MENU } from './menu';

afterEach(() => vi.unstubAllGlobals());

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
  'Clientes',
];

it('un administrador ve todas las entradas, incluida Configuración', () => {
  render(
    <ConSesion yo={yoDePrueba({ rol: 'admin' })}>
      <MenuLateral />
    </ConSesion>,
  );
  for (const texto of [...TEXTOS_COMUNES, 'Reportes', 'Configuración']) {
    expect(screen.getByText(texto)).toBeTruthy();
  }
});

it('un técnico no ve Configuración ni Reportes (el resto sí)', () => {
  render(
    <ConSesion yo={yoDePrueba({ rol: 'tecnico' })}>
      <MenuLateral />
    </ConSesion>,
  );
  expect(screen.queryByText('Configuración')).toBeNull();
  expect(screen.queryByText('Reportes')).toBeNull();
  for (const texto of TEXTOS_COMUNES) {
    expect(screen.getByText(texto)).toBeTruthy();
  }
});

it('coordinación y solo lectura ven Reportes', () => {
  for (const rol of ['coordinacion', 'lectura'] as const) {
    const { unmount } = render(
      <ConSesion yo={yoDePrueba({ rol })}>
        <MenuLateral />
      </ConSesion>,
    );
    expect(screen.getByText('Reportes')).toBeTruthy();
    unmount();
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

function conNoLeidos(n: number) {
  simularFetch(({ ruta }) =>
    ruta === '/api/avisos/no-leidos' ? respuesta(200, { no_leidos: n }) : undefined,
  );
  render(
    <ConSesion yo={yoDePrueba()}>
      <MenuLateral />
    </ConSesion>,
  );
}

it('con no_leidos: 3 aparece el badge «3» junto a Avisos', async () => {
  conNoLeidos(3);
  const badge = await screen.findByLabelText('3 avisos sin leer');
  expect(badge.textContent).toBe('3');
  expect(screen.getByRole('link', { name: /Avisos/ }).contains(badge)).toBe(true);
});

it('con no_leidos: 0 no hay badge', async () => {
  conNoLeidos(0);
  await screen.findByText('Avisos');
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByLabelText(/sin leer/)).toBeNull();
});

it('desde 100 el badge dice 99+', async () => {
  conNoLeidos(100);
  expect((await screen.findByLabelText('100 avisos sin leer')).textContent).toBe('99+');
});

it('menu.ts tiene 13 entradas con rutas únicas y solo Reportes y Configuración exigen permiso', () => {
  expect(MENU).toHaveLength(13);
  expect(new Set(MENU.map((e) => e.ruta)).size).toBe(13);
  expect(MENU.filter((e) => e.permiso).map((e) => e.etiqueta)).toEqual([
    'Reportes',
    'Configuración',
  ]);
});

it('todos los roles, incluido lectura, ven el enlace Ayuda hacia /ayuda', () => {
  for (const rol of ['admin', 'coordinacion', 'tecnico', 'lectura'] as const) {
    const { unmount } = render(
      <ConSesion yo={yoDePrueba({ rol })}>
        <MenuLateral />
      </ConSesion>,
    );
    expect(screen.getByRole('link', { name: 'Ayuda' }).getAttribute('href')).toBe('/ayuda');
    unmount();
  }
});

it('el enlace de la ruta actual lleva aria-current="page" y el fondo de acento suave', () => {
  render(
    <ConSesion yo={yoDePrueba()} ruta="/tickets/tabla">
      <MenuLateral />
    </ConSesion>,
  );
  const activo = screen.getByRole('link', { name: 'Tabla' });
  expect(activo.getAttribute('aria-current')).toBe('page');
  expect(activo.className).toContain('bg-acento-suave');
  const otro = screen.getByRole('link', { name: 'Horas' });
  expect(otro.getAttribute('aria-current')).toBeNull();
  expect(otro.className).not.toContain('bg-acento-suave');
});

it('los rótulos de grupo son decorativos (aria-hidden) y de 11 px', () => {
  render(
    <ConSesion yo={yoDePrueba({ rol: 'admin' })}>
      <MenuLateral />
    </ConSesion>,
  );
  for (const grupo of ['Tickets', 'Trabajo', 'Administración']) {
    const rotulo = screen.getByText(grupo, { selector: 'div' });
    expect(rotulo.getAttribute('aria-hidden')).toBe('true');
    expect(rotulo.className).toContain('text-[11px]');
  }
});
