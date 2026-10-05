import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { hoyIso } from '@/components/dominio/formato-fecha';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RequierePermiso } from '@/features/auth/RequierePermiso';
import { respuesta, simularFetch } from '@/test/fetch';
import { reporteDePrueba } from '@/test/reportes';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { USUARIOS_PRUEBA } from '@/test/tickets';
import { rangoDePreset } from '../filtros';
import { ReportesPage } from './ReportesPage';

const descargar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  descargar,
}));

// Radix Select usa estas APIs del DOM que jsdom no trae.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  descargar.mockReset();
  descargar.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

const DEPARTAMENTOS = [
  { id: 3, nombre: 'Soporte TI' },
  { id: 4, nombre: 'Coordinación' },
];
const CLIENTES = [
  { id: 21, nombre: 'Clínica Los Robles', es_interno: false },
  { id: 30, nombre: 'Operaciones', es_interno: true },
];

function Ubicacion() {
  const l = useLocation();
  return <div data-testid="ubicacion">{`${l.pathname}${l.search}`}</div>;
}

function montar(
  rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura' = 'lectura',
  ruta = '/reportes',
  manejador?: Parameters<typeof simularFetch>[0],
) {
  const llamadas = simularFetch(...(manejador ? [manejador] : []), ({ ruta, metodo }) => {
    if (metodo !== 'GET') return undefined;
    if (ruta.startsWith('/api/reportes')) return respuesta(200, reporteDePrueba());
    if (ruta.startsWith('/api/departamentos')) return respuesta(200, DEPARTAMENTOS);
    if (ruta.startsWith('/api/clientes')) return respuesta(200, CLIENTES);
    if (ruta.startsWith('/api/usuarios')) return respuesta(200, USUARIOS_PRUEBA);
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba({ rol })} ruta={ruta}>
      <TooltipProvider>
        <Routes>
          <Route element={<RequierePermiso permiso="reportes.ver" />}>
            <Route path="/reportes" element={<ReportesPage />} />
          </Route>
          <Route path="*" element={<p>otra ruta</p>} />
        </Routes>
        <Ubicacion />
      </TooltipProvider>
    </ConSesion>,
  );
  return llamadas;
}

const esperar = () => screen.findByRole('group', { name: /^Tickets cerrados: 6/ });

const filas = (tabla: HTMLElement) =>
  within(tabla)
    .getAllByRole('row')
    .slice(1)
    .map((f) => Array.from(f.children).map((c) => c.textContent));

it('con el escenario de la spec muestra las cuatro cifras de los indicadores', async () => {
  montar();
  const cerrados = await esperar();
  expect(cerrados.textContent).toContain('6');
  expect(cerrados.textContent).toContain('4 resueltos · 1 descartado · 1 duplicado');
  expect(screen.getByText('1,5 días hábiles')).toBeTruthy();
  expect(screen.getByText('75 %')).toBeTruthy();
  expect(screen.getByText('50 %')).toBeTruthy();
  expect(screen.getByRole('heading', { level: 1, name: 'Reportes' })).toBeTruthy();
  expect(screen.getByText('Período del 28 de septiembre al 4 de octubre de 2026')).toBeTruthy();
});

it('la tabla oculta de horas por semana tiene la fila «2026-09-28 · 5 · 5 · 10»', async () => {
  montar();
  await esperar();
  const tabla = screen.getByRole('table', { name: /Horas por semana/ });
  expect(filas(tabla)).toEqual([['2026-09-28', '5', '5', '10']]);
});

it('la carga muestra «2 · 10/32,8 h» para la primera persona', async () => {
  montar();
  await esperar();
  expect(screen.getByText(/^2 · 10\/32,8 h/)).toBeTruthy();
  expect((screen.getByRole('img', { name: /^Camila Rojas:/ }) as HTMLElement).style.width).toBe(
    '30%',
  );
});

it('«sobre plazo» aparece solo en Alta', async () => {
  montar();
  await esperar();
  const marcas = screen.getAllByText(/· sobre plazo/);
  expect(marcas).toHaveLength(1);
  expect(marcas[0]!.closest('li')?.textContent).toContain('Alta');
});

it('la tabla por cliente muestra $250.000 facturado en Clínica y «—» en Interno', async () => {
  montar();
  await esperar();
  const clinica = screen.getByRole('link', { name: 'Clínica Los Robles' }).closest('tr')!;
  expect(within(clinica).getByText('$250.000')).toBeTruthy();
  const interno = screen.getByText('Interno').closest('tr')!;
  expect(within(interno).getAllByText('—')).toHaveLength(2);
});

it('con solo lectura se ve todo, montos incluidos', async () => {
  montar('lectura');
  await esperar();
  const vina = screen.getByRole('link', { name: 'Viña' }).closest('tr')!;
  expect(within(vina).getByText('$680.000')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Exportar (.xlsx)' })).toBeTruthy();
});

it('?departamento=3 se envía como departamento_id=3 y el selector lo muestra', async () => {
  const llamadas = montar('admin', '/reportes?departamento=3');
  await esperar();
  expect(llamadas.some((l) => l.ruta === '/api/reportes?departamento_id=3')).toBe(true);
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Departamento' }).textContent).toBe('Soporte TI'),
  );
});

it('elegir «Mes anterior» escribe desde y hasta en la URL y los envía a la API', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar('admin');
  await esperar();
  await usuario.click(screen.getByRole('combobox', { name: 'Período' }));
  await usuario.click(await screen.findByRole('option', { name: 'Mes anterior' }));
  const { desde, hasta } = rangoDePreset('mes_anterior', hoyIso());
  await waitFor(() =>
    expect(screen.getByTestId('ubicacion').textContent).toBe(
      `/reportes?desde=${desde}&hasta=${hasta}`,
    ),
  );
  await waitFor(() =>
    expect(llamadas.some((l) => l.ruta === `/api/reportes?desde=${desde}&hasta=${hasta}`)).toBe(
      true,
    ),
  );
});

it('elegir «Personalizado» muestra las dos fechas', async () => {
  const usuario = userEvent.setup();
  montar('admin', '/reportes?desde=2026-09-01&hasta=2026-09-30');
  await esperar();
  await usuario.click(screen.getByRole('combobox', { name: 'Período' }));
  await usuario.click(await screen.findByRole('option', { name: 'Personalizado' }));
  expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('2026-09-01');
  expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('2026-09-30');
});

it('desde > hasta muestra el mensaje de la API en línea, sin error de página', async () => {
  montar('admin', '/reportes?desde=2026-10-10&hasta=2026-10-01', ({ ruta }) =>
    ruta.startsWith('/api/reportes')
      ? respuesta(400, {
          error: {
            codigo: 'VALIDACION',
            mensaje: 'El fin del período es anterior al inicio',
            detalles: { hasta: ['El fin del período es anterior al inicio'] },
          },
        })
      : undefined,
  );
  const alerta = await screen.findByRole('alert');
  expect(alerta.textContent).toBe('El fin del período es anterior al inicio');
  expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  // los filtros siguen disponibles para corregir
  expect(screen.getByRole('combobox', { name: 'Período' })).toBeTruthy();
});

it('«Exportar (.xlsx)» descarga la URL de exportación con los filtros', async () => {
  const usuario = userEvent.setup();
  montar('admin', '/reportes?desde=2026-09-28&hasta=2026-10-04&cliente=21');
  await esperar();
  await usuario.click(screen.getByRole('button', { name: 'Exportar (.xlsx)' }));
  expect(descargar).toHaveBeenCalledWith(
    '/api/reportes/exportar.xlsx?desde=2026-09-28&hasta=2026-10-04&cliente_id=21',
  );
});

it('un técnico ve «Sin permiso» en /reportes y no pide el reporte', async () => {
  const llamadas = montar('tecnico');
  expect(await screen.findByText('No tienes permiso para ver esta sección')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Reportes' })).toBeNull();
  expect(llamadas.some((l) => l.ruta.startsWith('/api/reportes'))).toBe(false);
});

it('un error de red muestra el estado de error con Reintentar', async () => {
  montar('admin', '/reportes', ({ ruta }) =>
    ruta.startsWith('/api/reportes')
      ? respuesta(500, { error: { codigo: 'INTERNO', mensaje: 'Algo falló' } })
      : undefined,
  );
  expect((await screen.findByRole('alert')).textContent).toContain('Algo falló');
  expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
});
