import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import type { LineaTiempoDatos } from '@/features/tickets/api';
import { respuesta, simularFetch } from '@/test/fetch';
import { itemDePrueba, lineaDePrueba } from '@/test/linea-tiempo';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { LineaDeTiempoPage } from './LineaDeTiempoPage';

afterEach(() => vi.unstubAllGlobals());

function Ubicacion() {
  const { search } = useLocation();
  return <output aria-label="URL">{search}</output>;
}

function montar(
  datos: LineaTiempoDatos = lineaDePrueba(),
  ruta = '/tickets/linea-de-tiempo?desde=2026-09-28',
) {
  const llamadas = simularFetch(({ ruta: r, metodo }) =>
    metodo === 'GET' && r.startsWith('/api/tickets/linea-de-tiempo')
      ? respuesta(200, datos)
      : undefined,
  );
  render(
    <ConSesion yo={yoDePrueba({ id: 3, nombre: 'Sebastián Díaz' })} ruta={ruta}>
      <LineaDeTiempoPage />
      <Ubicacion />
    </ConSesion>,
  );
  return llamadas;
}

const barras = () => document.querySelectorAll('[data-barra]');
const filas = () => document.querySelectorAll('[data-fila]');

it('dibuja 10 filas (una por persona), 10 columnas hábiles y hoy en acento', async () => {
  const llamadas = montar();
  await screen.findByText('Mar 29');
  expect(filas()).toHaveLength(11); // 10 personas + «Sin asignar»
  expect(document.querySelectorAll('[data-dia]')).toHaveLength(10);
  const hoy = screen.getByText('Mar 29');
  expect(hoy.className).toContain('bg-acento');
  expect(hoy.className).toContain('text-white');
  expect(screen.getByText('Lun 5')).toBeTruthy();
  expect(llamadas[0]?.ruta).toBe('/api/tickets/linea-de-tiempo?desde=2026-09-28&hasta=2026-10-18');
  // quien mira (Sebastián) va primero y los demás en orden alfabético
  expect(filas()[0]?.getAttribute('data-fila')).toBe('persona-3');
  expect(filas()[1]?.getAttribute('data-fila')).toBe('persona-2');
});

it('muestra «lo que hace ahora» de cada persona', async () => {
  montar();
  const fila = (await screen.findAllByRole('listitem')).find(
    (f) => f.getAttribute('data-fila') === 'persona-2',
  )!;
  expect(within(fila).getByText(/^TK-1048 Error al emitir/, { selector: 'p' })).toBeTruthy();
  const sinTicket = document.querySelector('[data-fila="persona-10"]')!;
  expect(within(sinTicket as HTMLElement).getByText('Sin ticket en curso')).toBeTruthy();
});

it('agrupar=cliente renderiza una fila por cliente y «Sin cliente»', async () => {
  montar(lineaDePrueba(), '/tickets/linea-de-tiempo?desde=2026-09-28&agrupar=cliente');
  await screen.findByText('Mar 29');
  const claves = [...filas()].map((f) => f.getAttribute('data-fila'));
  expect(claves).toEqual(['cliente-2', 'cliente-1', 'sin-cliente']);
  expect(screen.getByText('Constructora Andes')).toBeTruthy();
});

it('un vencido abierto lleva el ícono y su barra llega hasta hoy', async () => {
  montar();
  await screen.findByText('Mar 29');
  const barra = document.querySelector('[data-barra="9"]') as HTMLElement;
  expect(barra.getAttribute('data-vencido')).toBe('true');
  expect(barra.querySelector('svg')).toBeTruthy();
  expect(barra.getAttribute('data-columna-inicio')).toBe('0');
  expect(barra.getAttribute('data-columna-fin')).toBe('1'); // martes 29: segunda columna
});

it('«2 vencidos» filtra las barras y queda en la URL', async () => {
  const usuario = userEvent.setup();
  montar();
  await screen.findByText('Mar 29');
  expect(barras()).toHaveLength(6);
  const boton = screen.getByRole('button', { name: '2 vencidos' });
  await usuario.click(boton);
  expect(screen.getByLabelText('URL').textContent).toContain('vencidos=true');
  expect(boton.getAttribute('aria-pressed')).toBe('true');
  expect(barras()).toHaveLength(2);
});

it('sin vencidos no hay aviso', async () => {
  montar(lineaDePrueba({ vencidos: 0 }));
  await screen.findByText('Mar 29');
  expect(screen.queryByRole('button', { name: /vencido/ })).toBeNull();
});

it('un ticket sin fecha límite ocupa una columna con «sin fecha»', async () => {
  montar();
  await screen.findByText('Mar 29');
  const barra = document.querySelector('[data-barra="11"]') as HTMLElement;
  expect(barra.getAttribute('data-columna-inicio')).toBe(barra.getAttribute('data-columna-fin'));
  expect(barra.textContent).toContain('sin fecha');
  expect(barra.getAttribute('href')).toBe('/tickets/11');
});

it('dos barras solapadas de una fila van en subfilas distintas', async () => {
  montar();
  await screen.findByText('Mar 29');
  const a = document.querySelector('[data-barra="7"]') as HTMLElement;
  const b = document.querySelector('[data-barra="8"]') as HTMLElement;
  expect(a.getAttribute('data-subfila')).not.toBe(b.getAttribute('data-subfila'));
  expect(a.textContent).toContain('· OT-0218');
});

it('las escalas y la navegación cambian la URL y el rango pedido', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  await screen.findByText('Mar 29');
  await usuario.click(screen.getByRole('button', { name: 'Rango siguiente' }));
  expect(screen.getByLabelText('URL').textContent).toContain('desde=2026-10-12');
  await waitFor(() =>
    expect(llamadas.some((l) => l.ruta.includes('desde=2026-10-12&hasta=2026-11-01'))).toBe(true),
  );
  await usuario.click(screen.getByRole('button', { name: 'Mes' }));
  expect(screen.getByLabelText('URL').textContent).toBe('?escala=mes');
  await usuario.click(screen.getByRole('button', { name: 'Día' }));
  expect(screen.getByLabelText('URL').textContent).toBe('?escala=dia');
  await usuario.click(screen.getByRole('button', { name: 'Cliente' }));
  expect(screen.getByLabelText('URL').textContent).toBe('?escala=dia&agrupar=cliente');
});

it('las barras enlazan al detalle y no hay menú de cambio de estado (ADR 0022)', async () => {
  montar(lineaDePrueba({ items: [itemDePrueba()], vencidos: 0 }));
  await screen.findByText('Mar 29');
  expect(screen.getByRole('link', { name: /TK-1048/ }).getAttribute('href')).toBe('/tickets/7');
  expect(screen.queryByRole('button', { name: /estado/i })).toBeNull();
});

it('un error de la API muestra el estado de error', async () => {
  simularFetch(() => respuesta(500, { error: { codigo: 'INTERNO', mensaje: 'Falló' } }));
  render(
    <ConSesion yo={yoDePrueba()}>
      <LineaDeTiempoPage />
    </ConSesion>,
  );
  expect(await screen.findByText(/Falló/)).toBeTruthy();
});
