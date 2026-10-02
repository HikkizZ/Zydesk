import { render, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PaginaNoEncontrada } from '@/app/PaginaNoEncontrada';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { MarkdownManual } from '../MarkdownManual';
import { AyudaPage } from './AyudaPage';
import { Navigate } from 'react-router';

const scrollIntoView = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  window.scrollTo = vi.fn();
});
afterEach(() => scrollIntoView.mockReset());

function montar(rol: 'admin' | 'tecnico' | 'coordinacion' | 'lectura', ruta: string) {
  return render(
    <ConSesion yo={yoDePrueba({ rol })} ruta={ruta}>
      <Routes>
        <Route path="/ayuda" element={<Navigate to="/ayuda/primeros-pasos" replace />} />
        <Route path="/ayuda/:manual" element={<AyudaPage />} />
        <Route path="*" element={<PaginaNoEncontrada />} />
      </Routes>
    </ConSesion>,
  );
}

const pestanas = () => within(screen.getByRole('navigation', { name: 'Manuales' }));

it('(a) /ayuda redirige a primeros pasos y el h1 es «Ayuda»', () => {
  montar('tecnico', '/ayuda');
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ayuda');
  expect(screen.getByRole('heading', { level: 2, name: 'Primeros pasos' })).toBeTruthy();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
});

it('(b) lectura no ve pestañas; admin ve 4 con aria-current en la actual', () => {
  const { unmount } = montar('lectura', '/ayuda/primeros-pasos');
  expect(screen.queryByRole('navigation', { name: 'Manuales' })).toBeNull();
  unmount();
  montar('admin', '/ayuda/tecnico');
  const enlaces = pestanas().getAllByRole('link');
  expect(enlaces).toHaveLength(4);
  expect(
    enlaces.filter((e) => e.getAttribute('aria-current') === 'page').map((e) => e.textContent),
  ).toEqual(['Manual de tickets para el equipo']);
});

it('(c) un manual inexistente muestra «Página no encontrada»', () => {
  montar('admin', '/ayuda/no-existe');
  expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeTruthy();
});

it('(d) un técnico en el manual de coordinación lo ve, con solo 2 pestañas', () => {
  montar('tecnico', '/ayuda/coordinacion');
  expect(screen.getByRole('heading', { level: 2, name: /Manual de coordinación/ })).toBeTruthy();
  expect(pestanas().getAllByRole('link')).toHaveLength(2);
});

it('(e) la tabla de «Avisos» se renderiza como table', () => {
  montar('tecnico', '/ayuda/primeros-pasos');
  const articulo = screen.getByRole('article');
  const tabla = within(articulo).getAllByRole('table')[0]!;
  expect(within(tabla).getByRole('columnheader', { name: 'Aviso' })).toBeTruthy();
  expect(within(tabla).getByRole('columnheader', { name: 'Cuándo llega' })).toBeTruthy();
});

it('(f) el HTML crudo del .md no llega al DOM', () => {
  const { container } = render(
    <ConSesion yo={yoDePrueba()}>
      <MarkdownManual
        texto={'# T\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\nfin'}
      />
    </ConSesion>,
  );
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain('fin');
});

it('(g) el enlace «Registrar horas» va a /ayuda/tecnico#registrar-horas y el encabezado tiene su id', () => {
  montar('tecnico', '/ayuda/tecnico');
  const articulo = within(screen.getByRole('article'));
  const heading = articulo.getByRole('heading', { name: 'Registrar horas' });
  expect(heading.id).toBe('registrar-horas');
  const enlace = articulo.getAllByRole('link', { name: 'Registrar horas' })[0]!;
  expect(enlace.getAttribute('href')).toBe('#registrar-horas');
});

it('(g2) un enlace entre manuales es un Link a /ayuda/<clave>#ancla', () => {
  montar('admin', '/ayuda/coordinacion');
  const enlace = within(screen.getByRole('article')).getAllByRole('link', {
    name: 'Registrar horas',
  })[0]!;
  expect(enlace.getAttribute('href')).toBe('/ayuda/tecnico#registrar-horas');
});

it('(h) entrar con #ancla enfoca el encabezado', async () => {
  montar('tecnico', '/ayuda/tecnico#registrar-horas');
  await waitFor(() => expect(document.activeElement?.id).toBe('registrar-horas'));
  expect(scrollIntoView).toHaveBeenCalled();
});

it('los ids de los encabezados coinciden con los del índice «En esta página»', () => {
  montar('admin', '/ayuda/administracion');
  const articulo = screen.getByRole('article');
  const aside = within(
    screen.getByRole('complementary', { name: 'Índice del manual', hidden: true }),
  );
  const enlaces = aside.getAllByRole('link', { hidden: true });
  expect(enlaces.length).toBeGreaterThan(0);
  for (const e of enlaces) {
    const id = e.getAttribute('href')!.slice(1);
    expect(articulo.querySelector(`[id="${id}"]`), id).not.toBeNull();
  }
});
