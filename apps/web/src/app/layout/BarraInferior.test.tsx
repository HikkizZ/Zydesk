import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { BarraInferior } from './BarraInferior';

const salir = vi.hoisted(() => vi.fn());
vi.mock('@/features/auth/api', () => ({ salir }));

beforeEach(() => {
  salir.mockReset();
  salir.mockResolvedValue(undefined);
});

function Ruta() {
  return <div data-testid="ruta">{useLocation().pathname}</div>;
}

function montar(rol: 'admin' | 'tecnico' = 'tecnico', ruta = '/mi-dia') {
  return render(
    <ConSesion yo={yoDePrueba({ rol })} ruta={ruta}>
      <BarraInferior />
      <Routes>
        <Route path="*" element={<Ruta />} />
      </Routes>
    </ConSesion>,
  );
}

const botonMas = () => screen.getByRole('button', { name: 'Más', hidden: true });

it('(a) hay 4 enlaces y un botón Más con aria-haspopup="dialog" y aria-expanded="false"', () => {
  montar();
  const barra = screen.getByRole('navigation', { name: 'Principal (móvil)' });
  expect(within(barra).getAllByRole('link')).toHaveLength(4);
  expect(botonMas().getAttribute('aria-haspopup')).toBe('dialog');
  expect(botonMas().getAttribute('aria-expanded')).toBe('false');
});

it('(b) al pulsar Más aparece el diálogo "Menú" y aria-expanded="true"', async () => {
  montar();
  await userEvent.click(botonMas());
  expect(await screen.findByRole('dialog', { name: 'Menú' })).toBeTruthy();
  expect(botonMas().getAttribute('aria-expanded')).toBe('true');
});

it('(c) admin ve Configuración en el panel, técnico no; ambos ven el resto', async () => {
  const comunes = [
    'Tablero',
    'Tabla',
    'Línea de tiempo',
    'Órdenes de trabajo',
    'Cotizador',
    'Horas',
    'Reportes',
    'Clientes',
  ];
  for (const rol of ['admin', 'tecnico'] as const) {
    const { unmount } = montar(rol);
    await userEvent.click(botonMas());
    const panel = await screen.findByRole('dialog', { name: 'Menú' });
    for (const texto of comunes) {
      expect(within(panel).getByRole('link', { name: texto })).toBeTruthy();
    }
    expect(within(panel).queryByRole('link', { name: 'Configuración' }) !== null).toBe(
      rol === 'admin',
    );
    unmount();
  }
});

it('(d) el panel muestra el enlace Perfil con nombre y etiqueta del rol', async () => {
  montar('tecnico');
  await userEvent.click(botonMas());
  const panel = await screen.findByRole('dialog', { name: 'Menú' });
  const perfil = within(panel).getByRole('link', { name: /Diego Muñoz/ });
  expect(perfil.getAttribute('href')).toBe('/perfil');
  expect(within(perfil).getByText('Diego Muñoz')).toBeTruthy();
  expect(within(perfil).getByText('Técnico')).toBeTruthy();
});

it('(e) pulsar un enlace del panel lo cierra', async () => {
  montar();
  await userEvent.click(botonMas());
  const panel = await screen.findByRole('dialog', { name: 'Menú' });
  await userEvent.click(within(panel).getByRole('link', { name: 'Clientes' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByTestId('ruta').textContent).toBe('/clientes');
});

it('(f) Escape cierra el panel y el foco vuelve al botón Más', async () => {
  montar();
  await userEvent.click(botonMas());
  await screen.findByRole('dialog', { name: 'Menú' });
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(botonMas());
});

it('(g) Cerrar sesión llama a salir y navega a /ingresar', async () => {
  montar();
  await userEvent.click(botonMas());
  const panel = await screen.findByRole('dialog', { name: 'Menú' });
  await userEvent.click(within(panel).getByRole('button', { name: 'Cerrar sesión' }));
  expect(salir).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('/ingresar')).toBeTruthy();
});

it('Más se pinta activo solo cuando la ruta no es de los otros cuatro accesos', () => {
  const { unmount } = montar('tecnico', '/clientes');
  expect(botonMas().className).toContain('bg-white/10');
  unmount();
  montar('tecnico', '/tickets');
  expect(botonMas().className).not.toContain('bg-white/10');
});
