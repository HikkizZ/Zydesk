import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { expect, it } from 'vitest';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { BarraSuperior } from './layout/BarraSuperior';
import { migasDe } from './migas';
import { MigasProvider, useMigas } from './proveedores';

const etiquetas = (pathname: string, datos = {}) => migasDe(pathname, datos).map((m) => m.etiqueta);

it('rutas fijas', () => {
  expect(etiquetas('/mi-dia')).toEqual(['Mi día']);
  expect(etiquetas('/tickets')).toEqual(['Tickets', 'Tablero']);
  expect(etiquetas('/tickets/tabla')).toEqual(['Tickets', 'Tabla']);
  expect(etiquetas('/tickets/linea-de-tiempo')).toEqual(['Tickets', 'Línea de tiempo']);
  expect(etiquetas('/tickets/nuevo')).toEqual(['Tickets', 'Nuevo ticket']);
  expect(etiquetas('/ots')).toEqual(['Trabajo', 'Órdenes de trabajo']);
  expect(etiquetas('/cotizaciones')).toEqual(['Trabajo', 'Cotizador']);
  expect(etiquetas('/horas')).toEqual(['Trabajo', 'Horas']);
  expect(etiquetas('/reportes')).toEqual(['Administración', 'Reportes']);
  expect(etiquetas('/clientes')).toEqual(['Administración', 'Clientes']);
  expect(etiquetas('/avisos')).toEqual(['Avisos']);
  expect(etiquetas('/perfil')).toEqual(['Perfil']);
});

it('/tickets/nuevo no se confunde con /tickets/:id', () => {
  expect(migasDe('/tickets/nuevo')[1]?.mono).toBeUndefined();
});

it('detalles: la primera miga enlaza y la última lleva el código en mono', () => {
  expect(migasDe('/tickets/12', { codigo: 'TK-1048' })).toEqual([
    { etiqueta: 'Tickets', ruta: '/tickets' },
    { etiqueta: 'TK-1048', mono: true },
  ]);
  expect(migasDe('/ots/3', { codigo: 'OT-0218' })).toEqual([
    { etiqueta: 'Órdenes de trabajo', ruta: '/ots' },
    { etiqueta: 'OT-0218', mono: true },
  ]);
  expect(migasDe('/cotizaciones/3', { codigo: 'COT-0218' })).toEqual([
    { etiqueta: 'Cotizador', ruta: '/cotizaciones' },
    { etiqueta: 'COT-0218', mono: true },
  ]);
  expect(migasDe('/clientes/5', { nombre: 'Acme' })).toEqual([
    { etiqueta: 'Clientes', ruta: '/clientes' },
    { etiqueta: 'Acme' },
  ]);
});

it('mientras la página no publica sus datos la última miga es «…»', () => {
  expect(etiquetas('/tickets/12')).toEqual(['Tickets', '…']);
  expect(etiquetas('/clientes/5')).toEqual(['Clientes', '…']);
});

it('configuración y ayuda usan la etiqueta de la pestaña o del manual', () => {
  expect(etiquetas('/configuracion/tarifas')).toEqual([
    'Administración',
    'Configuración',
    'Tarifas',
  ]);
  expect(etiquetas('/configuracion/equipo')[2]).toBe('Equipo y permisos');
  const ayuda = migasDe('/ayuda/primeros-pasos');
  expect(ayuda[0]?.etiqueta).toBe('Ayuda');
  expect(ayuda[1]?.etiqueta).not.toBe('…');
});

it('una ruta desconocida no tiene migas', () => {
  expect(migasDe('/nada')).toEqual([]);
});

// Seguridad (spec fase 10 §11): un nombre con HTML se muestra como texto escapado, nunca se interpola.
it('un nombre de cliente con HTML se renderiza como texto escapado', () => {
  const NOMBRE = '<img src=x onerror=alert(1)>';
  expect(migasDe('/clientes/5', { nombre: NOMBRE })[1]?.etiqueta).toBe(NOMBRE);

  function PaginaCliente() {
    useMigas({ nombre: NOMBRE });
    return null;
  }
  const { container } = render(
    createElement(
      ConSesion,
      { yo: yoDePrueba(), ruta: '/clientes/5' },
      createElement(
        MigasProvider,
        null,
        createElement(BarraSuperior),
        createElement(PaginaCliente),
      ),
    ),
  );
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText(NOMBRE).getAttribute('aria-current')).toBe('page');
  expect(container.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
});
