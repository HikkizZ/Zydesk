import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { TareaDatos } from '@/features/tickets/api';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { USUARIOS_PRUEBA } from '@/test/tickets';
import { ListaTareas } from './ListaTareas';

afterEach(() => vi.unstubAllGlobals());

const tarea = (
  id: number,
  titulo: string,
  hecha: boolean,
  extra: Partial<TareaDatos> = {},
): TareaDatos => ({
  id,
  ticket_id: 7,
  ot_id: null,
  horas_estimadas: null,
  horas_reales: null,
  titulo,
  responsable: null,
  fecha: null,
  hecha,
  hecha_en: null,
  orden: id,
  vencida: false,
  creado_en: '2026-09-28T19:58:00.000Z',
  actualizado_en: '2026-09-28T19:58:00.000Z',
  ...extra,
});

const TAREAS = [
  tarea(1, 'Revisar log', true),
  tarea(2, 'Pedir CAF', true),
  tarea(3, 'Cargar CAF', false, { fecha: '2026-09-29', vencida: true }),
  tarea(4, 'Pasar a producción', false),
  tarea(5, 'Confirmar bolsa', false),
];

function montar(cerrado: boolean, rol: 'tecnico' | 'lectura' = 'tecnico') {
  const llamadas = simularFetch(({ ruta, metodo }) => {
    if (ruta.startsWith('/api/usuarios')) return respuesta(200, USUARIOS_PRUEBA);
    if (metodo === 'PATCH') return respuesta(200, tarea(3, 'Cargar CAF', true));
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba({ rol })}>
      <ListaTareas ticketId={7} tareas={TAREAS} cerrado={cerrado} />
    </ConSesion>,
  );
  return llamadas;
}

const casilla = () =>
  screen.getByRole('checkbox', { name: 'Tarea hecha: Cargar CAF' }) as HTMLButtonElement;

it('calcula el progreso (2 de 5 hechas) y marca la fecha vencida', () => {
  montar(false);
  expect(screen.getByRole('heading', { name: 'Tareas · 2/5' })).toBeTruthy();
  expect(
    screen.getByRole('progressbar', { name: 'Progreso de tareas' }).getAttribute('aria-valuenow'),
  ).toBe('40');
  expect(screen.getByText('29 sep').className).toContain('text-urgente');
});

it('marcar una tarea llama a PATCH con hecha', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(false);
  await usuario.click(casilla());
  const patch = llamadas.find((l) => l.metodo === 'PATCH');
  expect(patch?.ruta).toBe('/api/tareas/3');
  expect(patch?.cuerpo).toEqual({ hecha: true });
});

it('con el ticket cerrado se ocultan alta y quitar, pero se puede marcar', () => {
  montar(true);
  expect(screen.queryByLabelText('Nueva tarea')).toBeNull();
  expect(screen.queryByRole('button', { name: /Quitar tarea/ })).toBeNull();
  expect(casilla().disabled).toBe(false);
});

it('sin permiso de edición todo queda de solo lectura', () => {
  montar(false, 'lectura');
  expect(screen.queryByLabelText('Nueva tarea')).toBeNull();
  expect(casilla().disabled).toBe(true);
});
