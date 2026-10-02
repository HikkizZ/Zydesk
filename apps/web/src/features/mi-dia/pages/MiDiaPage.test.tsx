import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { respuesta, simularFetch } from '@/test/fetch';
import { miDiaDePrueba } from '@/test/mi-dia';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import type { MiDiaDatos } from '../api';
import { MiDiaPage } from './MiDiaPage';

afterEach(() => vi.unstubAllGlobals());

function montar(datos: MiDiaDatos, rol: 'tecnico' | 'coordinacion' | 'lectura' = 'coordinacion') {
  const llamadas = simularFetch(({ ruta, metodo }) => {
    if (metodo === 'GET' && ruta === '/api/mi-dia') return respuesta(200, datos);
    if (metodo === 'PATCH' && ruta.startsWith('/api/tareas/')) return respuesta(200, {});
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba({ rol })}>
      <MiDiaPage />
    </ConSesion>,
  );
  return llamadas;
}

const valorCuadro = (nombre: string) =>
  within(screen.getByRole('button', { name: new RegExp(`^${nombre}`) })).getByText(/^\d+$/)
    .textContent;

it('muestra los cuatro cuadros con los conteos de la respuesta y el título con la fecha', async () => {
  montar(miDiaDePrueba());
  expect(await screen.findByRole('heading', { name: 'Mi día · jueves 1 de octubre' })).toBeTruthy();
  expect(valorCuadro('Vencen hoy')).toBe('2');
  expect(valorCuadro('Por aprobar')).toBe('1');
  expect(valorCuadro('Te mencionaron')).toBe('3');
  expect(valorCuadro('Tus tareas')).toBe('3');
  expect(screen.getByRole('link', { name: 'Servidor de archivos no responde' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Revisar OT-0219' }).getAttribute('href')).toBe(
    '/ots/30',
  );
  expect(screen.getByRole('link', { name: 'Ver todos' }).getAttribute('href')).toBe(
    '/avisos?filtro=menciones',
  );
  expect(screen.getByText(/sin actividad desde hace 5 días/)).toBeTruthy();
});

it('marcar una tarea llama a editarTarea con hecha: true', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(miDiaDePrueba());
  await usuario.click(
    await screen.findByRole('checkbox', {
      name: 'Tarea hecha: Responder a Camila sobre la bolsa de horas',
    }),
  );
  await waitFor(() =>
    expect(llamadas.find((l) => l.metodo === 'PATCH')).toMatchObject({
      ruta: '/api/tareas/1',
      cuerpo: { hecha: true },
    }),
  );
});

it('sin ots.aprobar no se renderiza «Por aprobar»', async () => {
  montar(
    miDiaDePrueba({ por_aprobar: [], conteos: { ...miDiaDePrueba().conteos, por_aprobar: 0 } }),
    'tecnico',
  );
  await screen.findByText('Tus tareas', { selector: 'h2' });
  expect(screen.queryByText('Por aprobar')).toBeNull();
});

it('bajo 768 px los cuadros van en 2 columnas', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  montar(miDiaDePrueba());
  await screen.findByRole('button', { name: /^Vencen hoy/ });
  expect(document.querySelector('[data-columnas]')?.getAttribute('data-columnas')).toBe('2');
});

it('con lectura las casillas de las tareas están deshabilitadas', async () => {
  montar(miDiaDePrueba(), 'lectura');
  const casilla = await screen.findByRole('checkbox', {
    name: 'Tarea hecha: Revisar la carga del equipo',
  });
  expect((casilla as HTMLButtonElement).disabled).toBe(true);
});

it('sin nada pendiente muestra el estado vacío con enlace al Tablero', async () => {
  montar(
    miDiaDePrueba({
      vencen_hoy: [],
      por_aprobar: [],
      menciones: [],
      tareas: [],
      detenidos: [],
      conteos: {
        vencen_hoy: 0,
        vencidos: 0,
        por_aprobar: 0,
        menciones: 0,
        tareas: 0,
        detenidos: 0,
      },
    }),
  );
  expect(await screen.findByText('Nada pendiente por hoy')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Ir al Tablero' }).getAttribute('href')).toBe('/tickets');
});

it('un error de la API muestra el estado de error', async () => {
  simularFetch(() => respuesta(500, { error: { codigo: 'INTERNO', mensaje: 'Falló' } }));
  render(
    <ConSesion yo={yoDePrueba()}>
      <MiDiaPage />
    </ConSesion>,
  );
  expect(await screen.findByText(/Falló/)).toBeTruthy();
});
