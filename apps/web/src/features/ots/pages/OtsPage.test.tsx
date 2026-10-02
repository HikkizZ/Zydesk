import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { descargar } from '@/lib/api';
import { TooltipProvider } from '@/components/ui/tooltip';
import { respuesta, simularFetch, type Llamada } from '@/test/fetch';
import { otResumenDePrueba } from '@/test/ots';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { OtsPage } from './OtsPage';

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  descargar: vi.fn(),
}));

afterEach(() => vi.unstubAllGlobals());

const INDICADORES = {
  por_facturar: { n: 1, neto: 680000 },
  esperando_cliente: { n: 1, neto: 2150000 },
  en_ejecucion: 2,
  horas_internas_mes: 8,
};

// La ruta de indicadores cae bajo el prefijo de la lista de OT: su manejador va primero.
let indicadores: unknown = INDICADORES;
const manejarIndicadores = ({ ruta }: Llamada) =>
  ruta === '/api/ots/indicadores' ? respuesta(200, indicadores) : undefined;
beforeEach(() => {
  indicadores = INDICADORES;
  vi.mocked(descargar).mockClear();
});

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

function montar(ruta = '/ots', rol: 'tecnico' | 'coordinacion' = 'tecnico') {
  const llamadas = simularFetch(manejarIndicadores, ({ ruta, metodo }) => {
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
      <ConSesion yo={yoDePrueba({ rol })} ruta={ruta}>
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
  simularFetch(manejarIndicadores, ({ ruta }) =>
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
  simularFetch(manejarIndicadores, ({ ruta, metodo }) => {
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

it('los indicadores muestran los montos con formato CLP, las OT y las horas', async () => {
  montar('/ots', 'coordinacion');
  const grupo = await screen.findByRole('group', { name: 'Indicadores' });
  await waitFor(() => expect(within(grupo).getByText('$680.000')).toBeTruthy());
  expect(within(grupo).getByText('$2.150.000')).toBeTruthy();
  expect(within(grupo).getAllByText('· 1 OT')).toHaveLength(2);
  expect(within(grupo).getByText('2 OT')).toBeTruthy();
  expect(within(grupo).getByText('8 h')).toBeTruthy();
  const hrefs = within(grupo)
    .getAllByRole('link')
    .map((a) => a.getAttribute('href'));
  expect(hrefs).toEqual([
    '/ots?estado_facturacion=por_facturar',
    '/ots?etapa=cotizada',
    '/ots?etapa=en_ejecucion',
    '/ots?tipo=interna',
  ]);
});

it('sin reportes.ver los montos llegan null y se muestra «—»', async () => {
  indicadores = {
    ...INDICADORES,
    por_facturar: { n: 1, neto: null },
    esperando_cliente: { n: 1, neto: null },
  };
  montar();
  const grupo = await screen.findByRole('group', { name: 'Indicadores' });
  expect(within(grupo).getAllByText('—')).toHaveLength(2);
  expect(within(grupo).queryByText(/\$/)).toBeNull();
  expect(
    within(grupo).getAllByLabelText('Los montos requieren el permiso Ver reportes y montos'),
  ).toHaveLength(2);
});

it('muestra «Esperando aprobación» y «Borrador · por aprobar» como etiquetas de etapa', async () => {
  const esperando = otResumenDePrueba({ id: 14, codigo: 'OT-0214', esperando_cliente: true });
  const porAprobar = otResumenDePrueba({
    id: 19,
    codigo: 'OT-0219',
    tipo: 'interna',
    etapa: 'borrador',
    por_aprobar: true,
  });
  simularFetch(manejarIndicadores, ({ ruta }) =>
    ruta.startsWith('/api/ots')
      ? respuesta(200, { datos: [esperando, porAprobar], total: 2, pagina: 1, por_pagina: 50 })
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
  const fila = async (codigo: string) =>
    (await screen.findByRole('link', { name: codigo })).closest('tr') as HTMLElement;
  expect((await fila('OT-0214')).textContent).toContain('Esperando aprobación');
  expect((await fila('OT-0219')).textContent).toContain('Borrador · por aprobar');
});

it('con ots.facturar exporta con los filtros vigentes (chip, q y cliente)', async () => {
  const usuario = userEvent.setup();
  montar('/ots?estado_facturacion=por_facturar&q=folios&cliente_id=1', 'coordinacion');
  const boton = await screen.findByRole('button', { name: 'Exportar para facturación (.xlsx)' });
  expect((boton as HTMLButtonElement).disabled).toBe(false);
  await usuario.click(boton);
  await waitFor(() => expect(descargar).toHaveBeenCalledTimes(1));
  const url = new URL(vi.mocked(descargar).mock.calls[0]![0], 'http://x');
  expect(url.pathname).toBe('/api/ots/exportar.xlsx');
  expect(url.searchParams.get('estado_facturacion')).toBe('por_facturar');
  expect(url.searchParams.get('q')).toBe('folios');
  expect(url.searchParams.get('cliente_id')).toBe('1');
  expect(url.searchParams.has('pagina')).toBe(false);
  expect(url.searchParams.has('por_pagina')).toBe(false);
});

it('sin ots.facturar el botón de exportar está deshabilitado', async () => {
  montar();
  const boton = await screen.findByRole('button', { name: 'Exportar para facturación (.xlsx)' });
  expect((boton as HTMLButtonElement).disabled).toBe(true);
  expect(descargar).not.toHaveBeenCalled();
});

it('la etapa de un indicador llega a la consulta y se puede quitar', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar('/ots?etapa=cotizada');
  await screen.findByRole('link', { name: 'OT-0216' });
  expect(
    llamadas.some((l) => l.ruta.includes('etapa=cotizada') && l.ruta.includes('por_pagina=50')),
  ).toBe(true);
  await usuario.click(screen.getByRole('button', { name: 'Quitar filtro de etapa: Cotizada' }));
  expect(screen.getByLabelText('URL').textContent).toBe('');
});
