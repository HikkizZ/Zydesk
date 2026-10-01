import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { respuesta, simularFetch } from '@/test/fetch';
import { otResumenDePrueba } from '@/test/ots';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { OtsPage } from './OtsPage';

afterEach(() => vi.unstubAllGlobals());

function Ubicacion() {
  const { search } = useLocation();
  return <output aria-label="URL">{search}</output>;
}

const POR_FACTURAR = otResumenDePrueba({
  id: 16,
  codigo: 'OT-0216',
  titulo: 'Mantención trimestral',
  etapa: 'cerrada',
  estado_facturacion: 'por_facturar',
});

function montar(ruta = '/ots') {
  const llamadas = simularFetch(({ ruta, metodo }) => {
    if (metodo !== 'GET') return undefined;
    if (ruta.startsWith('/api/clientes')) return respuesta(200, []);
    if (ruta.startsWith('/api/ots')) {
      const url = new URL(ruta, 'http://x');
      const lista =
        url.searchParams.get('estado_facturacion') === 'por_facturar'
          ? [POR_FACTURAR]
          : [POR_FACTURAR, otResumenDePrueba()];
      return respuesta(200, {
        datos: lista,
        total: lista.length,
        pagina: 1,
        por_pagina: Number(url.searchParams.get('por_pagina') ?? 50),
      });
    }
    return undefined;
  });
  render(
    <TooltipProvider>
      <ConSesion yo={yoDePrueba()} ruta={ruta}>
        <OtsPage />
        <Ubicacion />
      </ConSesion>
    </TooltipProvider>,
  );
  return llamadas;
}

it('lista las OT con enlace a su pantalla y la pill "Por facturar"', async () => {
  montar();
  const enlace = await screen.findByRole('link', { name: 'OT-0216' });
  expect(enlace.getAttribute('href')).toBe('/ots/16');
  expect(screen.getAllByText('Por facturar').length).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: 'OT-0218' })).toBeTruthy();
  // vista de solo lectura: sin menú de cambio de etapa
  expect(screen.queryByRole('button', { name: /Cambiar etapa/ })).toBeNull();
});

it('los chips ponen su filtro en la URL y muestran su contador', async () => {
  const usuario = userEvent.setup();
  montar();
  await screen.findByRole('link', { name: 'OT-0216' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Por facturar (1)' })).toBeTruthy(),
  );

  await usuario.click(screen.getByRole('button', { name: /^Por facturar/ }));
  expect(screen.getByLabelText('URL').textContent).toBe('?estado_facturacion=por_facturar');
  expect(screen.getByRole('button', { name: /^Por facturar/ }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  await waitFor(() => expect(screen.queryByRole('link', { name: 'OT-0218' })).toBeNull());

  await usuario.click(screen.getByRole('button', { name: /^Internas/ }));
  expect(screen.getByLabelText('URL').textContent).toBe('?tipo=interna');
  await usuario.click(screen.getByRole('button', { name: /^Abiertas/ }));
  expect(screen.getByLabelText('URL').textContent).toBe('?abiertas=true');
  await usuario.click(screen.getByRole('button', { name: /^Todas/ }));
  expect(screen.getByLabelText('URL').textContent).toBe('');
});

it('un chip en la URL llega a la consulta', async () => {
  const llamadas = montar('/ots?abiertas=true');
  await screen.findByRole('link', { name: 'OT-0216' });
  expect(
    llamadas.some((l) => l.ruta.includes('abiertas=true') && l.ruta.includes('por_pagina=50')),
  ).toBe(true);
  expect(screen.getByRole('button', { name: /^Abiertas/ }).getAttribute('aria-pressed')).toBe(
    'true',
  );
});

it('sin resultados explica que las OT se crean desde un ticket', async () => {
  simularFetch(({ ruta }) =>
    ruta.startsWith('/api/ots')
      ? respuesta(200, { datos: [], total: 0, pagina: 1, por_pagina: 50 })
      : ruta.startsWith('/api/clientes')
        ? respuesta(200, [])
        : undefined,
  );
  render(
    <TooltipProvider>
      <ConSesion yo={yoDePrueba()} ruta="/ots">
        <OtsPage />
      </ConSesion>
    </TooltipProvider>,
  );
  expect(await screen.findByText('Sin órdenes de trabajo')).toBeTruthy();
  expect(screen.getByText('Se crean desde un ticket.')).toBeTruthy();
});

it('la columna "Neto / horas" muestra el neto de una facturable y las horas de una interna', async () => {
  const facturable = otResumenDePrueba({ id: 18, codigo: 'OT-0218', neto: 475000 });
  const interna = otResumenDePrueba({
    id: 19,
    codigo: 'OT-0219',
    tipo: 'interna',
    estado_facturacion: 'no_aplica',
    horas: { estimadas: 6, reales: 4, registradas: 6 },
  });
  const sinCotizar = otResumenDePrueba({ id: 20, codigo: 'OT-0220', neto: null });
  simularFetch(({ ruta, metodo }) => {
    if (metodo !== 'GET') return undefined;
    if (ruta.startsWith('/api/clientes')) return respuesta(200, []);
    if (ruta.startsWith('/api/ots')) {
      return respuesta(200, {
        datos: [facturable, interna, sinCotizar],
        total: 3,
        pagina: 1,
        por_pagina: 50,
      });
    }
    return undefined;
  });
  render(
    <TooltipProvider>
      <ConSesion yo={yoDePrueba()} ruta="/ots">
        <OtsPage />
      </ConSesion>
    </TooltipProvider>,
  );
  const fila = async (codigo: string) =>
    (await screen.findByRole('link', { name: codigo })).closest('tr') as HTMLElement;
  expect((await fila('OT-0218')).textContent).toContain('$475.000');
  expect(screen.getByRole('columnheader', { name: 'Neto / horas' })).toBeTruthy();
  expect((await fila('OT-0219')).textContent).toContain('6 / 6 h');
  expect((await fila('OT-0219')).textContent).not.toContain('$');
  // Facturable aún sin cotización: se muestran las horas como antes.
  expect((await fila('OT-0220')).textContent).toContain('10 / 3 h');
});
