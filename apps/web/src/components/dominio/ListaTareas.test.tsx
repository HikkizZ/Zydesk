import { render, screen, waitFor } from '@testing-library/react';
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
  horas_registradas: 0,
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

function montarOt(cerrado = false) {
  const llamadas = simularFetch(({ ruta, metodo }) => {
    if (ruta.startsWith('/api/usuarios')) return respuesta(200, USUARIOS_PRUEBA);
    if (metodo === 'PATCH') return respuesta(200, tarea(1, 'Diagnóstico', true));
    if (metodo === 'POST') return respuesta(201, tarea(9, 'Nueva', false));
    return undefined;
  });
  const tareasOt = [
    tarea(1, 'Diagnóstico', true, {
      ticket_id: null,
      ot_id: 5,
      horas_estimadas: 3,
      horas_reales: 3,
      horas_registradas: 3,
    }),
    tarea(2, 'Carga de CAF', false, {
      ticket_id: null,
      ot_id: 5,
      horas_estimadas: 4,
      horas_reales: 1,
    }),
    tarea(3, 'Paso a producción', false, { ticket_id: null, ot_id: 5, horas_estimadas: 2 }),
  ];
  render(
    <ConSesion yo={yoDePrueba()}>
      <ListaTareas destino={{ tipo: 'ot', id: 5 }} tareas={tareasOt} cerrado={cerrado} conHoras />
    </ConSesion>,
  );
  return llamadas;
}

it('con horas: muestra las horas registradas de cada tarea de OT', () => {
  montarOt();
  const celda = screen.getByLabelText('3 h estimadas, 3 h reales, 3 h registradas');
  expect(celda.textContent).toBe('3');
  expect(screen.getByLabelText('4 h estimadas, 1 h reales, 0 h registradas').textContent).toBe('0');
});

it('en tareas de ticket no aparece la columna de registradas', () => {
  montar(false);
  expect(screen.queryByText('Reg.')).toBeNull();
});

it('con horas: la cabecera suma estimadas y reales', () => {
  montarOt();
  expect(
    screen.getByRole('heading', { name: 'Tareas · 1/3 · 9 h estimadas · 4 h reales' }),
  ).toBeTruthy();
});

it('con horas: al perder el foco con un valor nuevo hace PATCH; sin cambio no', async () => {
  const usuario = userEvent.setup();
  const llamadas = montarOt();
  const real = screen.getByLabelText('Horas reales de Paso a producción');
  await usuario.click(real);
  await usuario.tab();
  expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(false);

  await usuario.type(real, '1.5');
  await usuario.tab();
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(true));
  const patch = llamadas.find((l) => l.metodo === 'PATCH');
  expect(patch?.ruta).toBe('/api/tareas/3');
  expect(patch?.cuerpo).toEqual({ horas_reales: 1.5 });
});

it('con horas: valores que no son múltiplos de 0,25 no se envían', async () => {
  const usuario = userEvent.setup();
  const llamadas = montarOt();
  const est = screen.getByLabelText('Horas estimadas de Carga de CAF');
  await usuario.clear(est);
  await usuario.type(est, '1.3');
  await usuario.tab();
  expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(false);
});

it('con horas: el alta de una tarea de OT envía horas_estimadas a la OT', async () => {
  const usuario = userEvent.setup();
  const llamadas = montarOt();
  await usuario.type(screen.getByLabelText('Nueva tarea'), 'Capacitación');
  await usuario.type(screen.getByLabelText('Horas est.'), '1');
  await usuario.click(screen.getByRole('button', { name: 'Agregar' }));
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true));
  const post = llamadas.find((l) => l.metodo === 'POST');
  expect(post?.ruta).toBe('/api/ots/5/tareas');
  expect(post?.cuerpo).toMatchObject({ titulo: 'Capacitación', horas_estimadas: 1 });
});

it('con la OT cerrada las horas quedan deshabilitadas pero se puede marcar', () => {
  montarOt(true);
  expect(
    (screen.getByLabelText('Horas estimadas de Carga de CAF') as HTMLInputElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole('checkbox', { name: 'Tarea hecha: Carga de CAF' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

it('la casilla está dentro de un label con for y el input de horas tiene alto táctil', () => {
  montar(false);
  const etiqueta = casilla().closest('label');
  expect(etiqueta?.getAttribute('for')).toBe(casilla().id);
  expect(etiqueta?.className).toContain('size-11');
  montarOt();
  const campo = screen.getAllByRole('spinbutton').find((e) => e.className.includes('h-11'));
  expect(campo?.className).toContain('lg:h-9');
  // A 320–375 px los dos campos y «Reg.» caben en la fila: 72 px en celular, 80 px solo en sm–lg.
  expect(campo?.className).toContain('w-[72px]');
  expect(campo?.className).toContain('sm:w-20');
});
