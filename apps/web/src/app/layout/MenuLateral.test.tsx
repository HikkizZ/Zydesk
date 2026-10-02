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

it('menu.ts tiene 13 entradas con rutas únicas y solo Configuración exige permiso', () => {
  expect(MENU).toHaveLength(13);
  expect(new Set(MENU.map((e) => e.ruta)).size).toBe(13);
  expect(MENU.filter((e) => e.permiso).map((e) => e.etiqueta)).toEqual(['Configuración']);
});
