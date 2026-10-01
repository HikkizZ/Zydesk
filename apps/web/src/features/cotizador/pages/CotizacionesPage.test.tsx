import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { resumenDeCotizacionDePrueba } from '@/test/cotizaciones';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { CotizacionesPage } from './CotizacionesPage';

afterEach(() => vi.unstubAllGlobals());

function Ubicacion() {
  const { search } = useLocation();
  return <output aria-label="URL">{search}</output>;
}

const BORRADOR = resumenDeCotizacionDePrueba({
  id: 5,
  ot_id: 22,
  codigo: 'COT-0219',
  estado: 'borrador',
  neto: 100000,
  total: 119000,
  ot: { id: 22, codigo: 'OT-0219', titulo: 'Cableado de oficina', etapa: 'borrador' },
});

function montar(ruta = '/cotizaciones', datos = [resumenDeCotizacionDePrueba(), BORRADOR]) {
  const llamadas = simularFetch(({ ruta, metodo }) => {
    if (metodo !== 'GET' || !ruta.startsWith('/api/cotizaciones')) return undefined;
    const url = new URL(ruta, 'http://x');
    const estado = url.searchParams.get('estado');
    const lista = estado ? datos.filter((c) => c.estado === estado) : datos;
    return respuesta(200, { datos: lista, total: lista.length, pagina: 1, por_pagina: 50 });
  });
  render(
    <TooltipProvider>
      <ConSesion yo={yoDePrueba()} ruta={ruta}>
        <CotizacionesPage />
        <Ubicacion />
      </ConSesion>
    </TooltipProvider>,
  );
  return llamadas;
}

it('lista las cotizaciones con enlaces, estado en texto y montos', async () => {
  montar();
  const enlace = await screen.findByRole('link', { name: 'COT-0218 v1' });
  expect(enlace.getAttribute('href')).toBe('/cotizaciones/4');
  expect(screen.getByRole('link', { name: 'OT-0218' }).getAttribute('href')).toBe('/ots/21');
  expect(screen.getByText('$565.250')).toBeTruthy();
  expect(screen.getByText('$475.000')).toBeTruthy();
  expect(screen.getByText('Enviada')).toBeTruthy();
  expect(screen.getByText('Borrador')).toBeTruthy();
  expect(screen.getAllByText('Viña Santa Clara').length).toBeGreaterThan(0);
  // vista de solo lectura: sin acciones de cambio
  expect(screen.queryByRole('button', { name: /Duplicar|Eliminar|Enviar/ })).toBeNull();
});

it('pide solo las versiones vigentes por defecto', async () => {
  const llamadas = montar();
  await screen.findByRole('link', { name: 'COT-0218 v1' });
  const get = llamadas.find((l) => l.ruta.startsWith('/api/cotizaciones'));
  expect(new URL(get?.ruta ?? '', 'http://x').searchParams.get('solo_vigentes')).toBe('true');
});

it('los chips ponen el estado en la URL y filtran', async () => {
  const usuario = userEvent.setup();
  montar();
  await screen.findByRole('link', { name: 'COT-0218 v1' });
  expect(screen.getByRole('button', { name: 'Todas' }).getAttribute('aria-pressed')).toBe('true');

  await usuario.click(screen.getByRole('button', { name: 'Borradores' }));
  expect(screen.getByLabelText('URL').textContent).toBe('?estado=borrador');
  expect(screen.getByRole('button', { name: 'Borradores' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  await waitFor(() => expect(screen.queryByRole('link', { name: 'COT-0218 v1' })).toBeNull());
  expect(screen.getByRole('link', { name: 'COT-0219 v1' })).toBeTruthy();

  await usuario.click(screen.getByRole('button', { name: 'Enviadas' }));
  expect(screen.getByLabelText('URL').textContent).toBe('?estado=enviada');
  await usuario.click(screen.getByRole('button', { name: 'Aprobadas' }));
  expect(screen.getByLabelText('URL').textContent).toBe('?estado=aprobada');
  await usuario.click(screen.getByRole('button', { name: 'Todas' }));
  expect(screen.getByLabelText('URL').textContent).toBe('');
});

it('la búsqueda escribe q en la URL', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  await screen.findByRole('link', { name: 'COT-0218 v1' });
  await usuario.type(screen.getByRole('searchbox', { name: 'Buscar cotizaciones' }), '218');
  await waitFor(() => expect(screen.getByLabelText('URL').textContent).toBe('?q=218'));
  await waitFor(() => expect(llamadas.some((l) => l.ruta.includes('q=218'))).toBe(true));
});

it('un chip activo llega desde la URL', async () => {
  montar('/cotizaciones?estado=enviada');
  await screen.findByRole('link', { name: 'COT-0218 v1' });
  expect(screen.getByRole('button', { name: 'Enviadas' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(screen.queryByRole('link', { name: 'COT-0219 v1' })).toBeNull();
});

it('sin resultados: "Sin cotizaciones. Se crean desde una OT facturable."', async () => {
  montar('/cotizaciones', []);
  expect(await screen.findByText('Sin cotizaciones')).toBeTruthy();
  expect(screen.getByText('Se crean desde una OT facturable.')).toBeTruthy();
});

it('muestra los montos en UF con su formato', async () => {
  montar('/cotizaciones', [
    resumenDeCotizacionDePrueba({ moneda: 'UF', neto: 12.5, total: 14.88, neto_clp: 475000 }),
  ]);
  expect(await screen.findByText('UF 12,50')).toBeTruthy();
  expect(screen.getByText('UF 14,88')).toBeTruthy();
});
