import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { PlanillaDatos } from '@/features/horas/api';
import {
  CLIENTE,
  FILAS_DISENO,
  celdaDePrueba,
  destinoOt,
  filaDePrueba,
  planillaDePrueba,
  registroDePrueba,
} from '@/test/horas';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { USUARIOS_PRUEBA } from '@/test/tickets';
import { HorasPage } from './HorasPage';

afterEach(() => vi.unstubAllGlobals());

const SEBASTIAN = { id: 3, nombre: 'Sebastián Díaz', rol: 'tecnico' as const };

function montar(
  planilla: PlanillaDatos = planillaDePrueba(),
  yo = yoDePrueba(SEBASTIAN),
  ruta = '/horas',
  extra?: Parameters<typeof simularFetch>[0],
) {
  const llamadas = simularFetch(...(extra ? [extra] : []), ({ ruta, metodo }) => {
    if (ruta.startsWith('/api/usuarios')) return respuesta(200, USUARIOS_PRUEBA);
    if (ruta.startsWith('/api/horas')) {
      if (metodo === 'GET') return respuesta(200, planilla);
      return metodo === 'DELETE' ? respuesta(204) : respuesta(200, { id: 1 });
    }
    return undefined;
  });
  render(
    <ConSesion yo={yo} ruta={ruta}>
      <HorasPage />
    </ConSesion>,
  );
  return llamadas;
}

const esperarPlanilla = () => screen.findByRole('link', { name: 'OT-0218' });

it('con la planilla del diseño el resumen muestra 12 h, 8,5 h y 3,5 h', async () => {
  montar();
  await esperarPlanilla();
  const resumen = screen.getByRole('region', { name: 'Resumen semanal' });
  expect(within(resumen).getByTestId('total-semana').textContent).toBe('12 h');
  expect(within(resumen).getByTestId('jornada-semana').textContent).toBe('41 h');
  expect(within(resumen).getByText('Facturables').nextElementSibling?.textContent).toBe('8,5 h');
  expect(within(resumen).getByText('Internas').nextElementSibling?.textContent).toBe('3,5 h');
});

it('el total del día se compara con la jornada: pasados o de hoy por debajo en "alta"', async () => {
  montar();
  await esperarPlanilla();
  const lunes = screen.getByText('7,5 de 8,5 h');
  const martes = screen.getByText('4,5 de 8,5 h');
  expect(lunes.getAttribute('data-tono')).toBe('alta');
  expect(martes.getAttribute('data-tono')).toBe('alta');
  // los días futuros no se marcan aunque estén por debajo de la jornada
  expect(screen.getAllByText('0 de 8,5 h')[0]?.getAttribute('data-tono')).toBe('neutro');
});

it('un día con más horas que la jornada queda en "urgente"', async () => {
  const fila = filaDePrueba('ot:21', destinoOt(21, 'OT-0218', 'Folios'), [9]);
  montar(planillaDePrueba({ filas: [fila] }));
  await esperarPlanilla();
  expect(screen.getByText('9 de 8,5 h').getAttribute('data-tono')).toBe('urgente');
});

it('las columnas se ordenan por índice (lunes a domingo) y muestran la jornada', async () => {
  montar();
  await esperarPlanilla();
  const cabeceras = screen.getAllByRole('columnheader').map((c) => c.textContent);
  expect(cabeceras.slice(1, 8)).toEqual([
    'Lun 288,5 h',
    'Mar 298,5 h',
    'Mié 308,5 h',
    'Jue 18,5 h',
    'Vie 27 h',
    'Sáb 30 h',
    'Dom 40 h',
  ]);
});

it('escribir 2,5 en una celda vacía crea el registro con horas 2.5', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  await esperarPlanilla();
  const celda = screen.getByLabelText('TK-1026 · Mar 29');
  await usuario.type(celda, '2,5');
  await usuario.tab();
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true));
  const post = llamadas.find((l) => l.metodo === 'POST');
  expect(post?.ruta).toBe('/api/horas');
  expect(post?.cuerpo).toEqual({
    fecha: '2026-09-29',
    horas: 2.5,
    fuera_de_horario: false,
    ticket_id: 26,
    ot_id: null,
    tarea_id: null,
    descripcion: null,
  });
});

it('en una fila por tarea el registro nuevo lleva la tarea', async () => {
  const usuario = userEvent.setup();
  const fila = filaDePrueba('ot:21:tarea:5', destinoOt(21, 'OT-0218', 'Folios'), [], {
    tarea: { id: 5, titulo: 'Diagnóstico', hecha: false },
  });
  const llamadas = montar(planillaDePrueba({ filas: [fila] }));
  await esperarPlanilla();
  await usuario.type(screen.getByLabelText('OT-0218 · Diagnóstico · Lun 28'), '1');
  await usuario.tab();
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true));
  expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toMatchObject({
    ot_id: 21,
    tarea_id: 5,
    horas: 1,
  });
});

it('editar una celda con fila manual hace PATCH y vaciarla hace DELETE', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  await esperarPlanilla();
  const registro = FILAS_DISENO[0]!.celdas[0]!.registros[0]!;

  const celda = screen.getByLabelText('OT-0218 · Lun 28');
  await usuario.clear(celda);
  await usuario.type(celda, '4');
  await usuario.tab();
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(true));
  const patch = llamadas.find((l) => l.metodo === 'PATCH');
  expect(patch?.ruta).toBe(`/api/horas/${registro.id}`);
  expect(patch?.cuerpo).toEqual({ horas: 4 });

  const otra = screen.getByLabelText('OT-0217 · Lun 28');
  const otroRegistro = FILAS_DISENO[1]!.celdas[0]!.registros[0]!;
  await usuario.clear(otra);
  await usuario.tab();
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'DELETE')).toBe(true));
  expect(llamadas.find((l) => l.metodo === 'DELETE')?.ruta).toBe(`/api/horas/${otroRegistro.id}`);
});

it('marcar "Fuera de horario" hace PATCH de la fila manual', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  await esperarPlanilla();
  await usuario.click(screen.getByRole('button', { name: 'Fuera de horario: OT-0218 · Lun 28' }));
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(true));
  expect(llamadas.find((l) => l.metodo === 'PATCH')?.cuerpo).toEqual({ fuera_de_horario: true });
});

it('si la API rechaza, la celda vuelve al valor anterior con borde de error', async () => {
  const usuario = userEvent.setup();
  montar(planillaDePrueba(), yoDePrueba(SEBASTIAN), '/horas', ({ metodo }) =>
    metodo === 'POST'
      ? respuesta(409, { error: { codigo: 'CONFLICTO', mensaje: 'Ya hay horas en esa celda' } })
      : undefined,
  );
  await esperarPlanilla();
  const celda = screen.getByLabelText('TK-1026 · Mar 29') as HTMLInputElement;
  await usuario.type(celda, '2');
  await usuario.tab();
  await waitFor(() => expect(celda.getAttribute('aria-invalid')).toBe('true'));
  expect(celda.value).toBe('');
});

it('las columnas futuras están deshabilitadas', async () => {
  montar();
  await esperarPlanilla();
  expect((screen.getByLabelText('OT-0218 · Mié 30') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('OT-0218 · Mar 29') as HTMLInputElement).disabled).toBe(false);
});

const CON_SEGUIMIENTO = () => {
  const seguimiento = registroDePrueba('2026-09-28', 3, {
    ot_id: 21,
    mensaje_id: 55,
    mensaje: { id: 55, tipo: 'seguimiento' },
  });
  const fila = filaDePrueba('ot:21', destinoOt(21, 'OT-0218', 'Folios'), []);
  fila.celdas[0] = celdaDePrueba('2026-09-28', [seguimiento]);
  fila.total = 3;
  return { fila, seguimiento };
};

it('una celda con seguimiento no tiene input y abre el detalle, donde se corrigen las horas', async () => {
  const usuario = userEvent.setup();
  const { fila, seguimiento } = CON_SEGUIMIENTO();
  const llamadas = montar(planillaDePrueba({ filas: [fila] }));
  await esperarPlanilla();
  expect(screen.queryByLabelText('OT-0218 · Lun 28')).toBeNull();
  await usuario.click(screen.getByRole('button', { name: /OT-0218 · Lun 28: 3 h, ver detalle/ }));

  const dialogo = await screen.findByRole('dialog');
  expect(within(dialogo).getByText('OT-0218 · lunes 28 sep')).toBeTruthy();
  const enlace = within(dialogo).getByRole('link', { name: 'Seguimiento' });
  expect(enlace.getAttribute('href')).toBe('/ots/21#mensaje-55');

  const horas = within(dialogo).getByLabelText(/^Horas \(/);
  await usuario.clear(horas);
  await usuario.type(horas, '2,5');
  await usuario.tab();
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(true));
  const patch = llamadas.find((l) => l.metodo === 'PATCH');
  expect(patch?.ruta).toBe(`/api/horas/${seguimiento.id}`);
  expect(patch?.cuerpo).toEqual({ horas: 2.5 });
});

it('quitar las horas de un seguimiento pide confirmar', async () => {
  const usuario = userEvent.setup();
  const { fila, seguimiento } = CON_SEGUIMIENTO();
  const llamadas = montar(planillaDePrueba({ filas: [fila] }));
  await esperarPlanilla();
  await usuario.click(screen.getByRole('button', { name: /ver detalle/ }));
  const dialogo = await screen.findByRole('dialog', { name: /OT-0218/ });
  await usuario.click(within(dialogo).getByRole('button', { name: 'Quitar' }));
  const alerta = await screen.findByRole('alertdialog');
  expect(within(alerta).getByText(/El seguimiento se conserva/)).toBeTruthy();
  expect(llamadas.some((l) => l.metodo === 'DELETE')).toBe(false);
  await usuario.click(within(alerta).getByRole('button', { name: 'Quitar horas' }));
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'DELETE')).toBe(true));
  expect(llamadas.find((l) => l.metodo === 'DELETE')?.ruta).toBe(`/api/horas/${seguimiento.id}`);
});

it('el detalle corrige la fecha de un registro (máximo hoy)', async () => {
  const { fila, seguimiento } = CON_SEGUIMIENTO();
  const llamadas = montar(planillaDePrueba({ filas: [fila] }));
  await esperarPlanilla();
  await userEvent.setup().click(screen.getByRole('button', { name: /ver detalle/ }));
  const dialogo = await screen.findByRole('dialog', { name: /OT-0218/ });
  const fecha = within(dialogo).getByLabelText(/^Fecha \(/) as HTMLInputElement;
  expect(fecha.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  fireEvent.change(fecha, { target: { value: '2026-09-27' } });
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(true));
  const patch = llamadas.find((l) => l.metodo === 'PATCH');
  expect(patch?.ruta).toBe(`/api/horas/${seguimiento.id}`);
  expect(patch?.cuerpo).toEqual({ fecha: '2026-09-27' });
});

it('"Agregar fila" Sin ticket crea la fila en el navegador, sin llamar a la API', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  await esperarPlanilla();
  await usuario.click(screen.getByRole('button', { name: 'Agregar fila' }));
  const dialogo = await screen.findByRole('dialog', { name: 'Agregar fila' });
  await usuario.click(within(dialogo).getByRole('tab', { name: 'Sin ticket' }));
  await usuario.type(within(dialogo).getByLabelText('Descripción'), 'Capacitación interna');
  await usuario.click(within(dialogo).getByRole('button', { name: 'Agregar' }));
  expect(await screen.findByText('Capacitación interna')).toBeTruthy();
  expect(screen.getByLabelText('Capacitación interna · Lun 28')).toBeTruthy();
  expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false);
});

it('"Agregar fila" de una OT con tarea busca por q y ofrece las tareas de la OT', async () => {
  const usuario = userEvent.setup();
  const ot = {
    id: 21,
    numero: 218,
    codigo: 'OT-0218',
    titulo: 'Regularización de folios',
    tipo: 'facturable',
    etapa: 'en_ejecucion',
    cliente: CLIENTE,
  };
  const cerrada = { ...ot, id: 16, codigo: 'OT-0216', titulo: 'Mantención', etapa: 'cerrada' };
  const llamadas = montar(
    planillaDePrueba({ filas: [] }),
    yoDePrueba(SEBASTIAN),
    '/horas',
    ({ ruta, metodo }) => {
      if (metodo !== 'GET') return undefined;
      if (/^\/api\/ots\/21/.test(ruta)) {
        return respuesta(200, {
          ...ot,
          tareas: [{ id: 5, titulo: 'Diagnóstico', hecha: false }],
        });
      }
      if (ruta.startsWith('/api/ots')) {
        return respuesta(200, { datos: [ot, cerrada], total: 2, pagina: 1, por_pagina: 10 });
      }
      return undefined;
    },
  );
  await screen.findByText('Sin horas esta semana');
  await usuario.click(screen.getAllByRole('button', { name: 'Agregar fila' })[0]!);
  const dialogo = await screen.findByRole('dialog', { name: 'Agregar fila' });
  await usuario.click(within(dialogo).getByRole('tab', { name: 'OT' }));
  await usuario.type(within(dialogo).getByLabelText('Buscar OT'), 'folios');
  await waitFor(() =>
    expect(llamadas.some((l) => l.ruta.includes('/api/ots?') && l.ruta.includes('q=folios'))).toBe(
      true,
    ),
  );
  expect(llamadas.find((l) => l.ruta.includes('q=folios'))?.ruta).toContain('por_pagina=10');
  const cerradaItem = await within(dialogo).findByText(/OT-0216.*\(cerrada\)/);
  expect(cerradaItem.closest('[data-disabled="true"]')).toBeTruthy();
  await usuario.click(await within(dialogo).findByText(/OT-0218 · Regularización/));
  expect(await within(dialogo).findByLabelText(/Tarea/)).toBeTruthy();
});

it('sin horas esta semana ofrece agregar una fila', async () => {
  montar(planillaDePrueba({ filas: [] }));
  expect(await screen.findByText('Sin horas esta semana')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Agregar fila' }).length).toBeGreaterThan(0);
});

it('bajo 768 px se renderiza la vista por día con el total del día al pie', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  const usuario = userEvent.setup();
  montar();
  await esperarPlanilla();
  expect(document.querySelector('[data-vista="dia"]')).toBeTruthy();
  expect(document.querySelector('table')).toBeNull();
  // abre en hoy (martes)
  expect(screen.getByText('4,5 de 8,5 h')).toBeTruthy();
  expect(screen.getByLabelText('TK-1049 · Mar 29')).toBeTruthy();
  await usuario.click(screen.getByRole('button', { name: 'Lun 28, 7,5 h' }));
  expect(screen.getByText('7,5 de 8,5 h')).toBeTruthy();
  expect(screen.getByLabelText('TK-1049 · Lun 28')).toBeTruthy();
});

it('en escritorio es una cuadrícula', async () => {
  montar();
  await esperarPlanilla();
  expect(document.querySelector('[data-vista="cuadricula"]')).toBeTruthy();
});

it('sin horas.ver_todas no hay selector de persona', async () => {
  montar();
  await esperarPlanilla();
  expect(screen.queryByRole('combobox', { name: 'Persona' })).toBeNull();
});

it('con horas.ver_todas hay selector y la planilla ajena es de solo lectura', async () => {
  const ajena = planillaDePrueba({ editable: false });
  const llamadas = montar(
    ajena,
    yoDePrueba({ id: 2, nombre: 'Camila Rojas', rol: 'coordinacion' }),
    '/horas?usuario=3&semana=2026-09-28',
  );
  await esperarPlanilla();
  expect(screen.getByRole('combobox', { name: 'Persona' })).toBeTruthy();
  expect(
    screen.getByText('Estás viendo la planilla de Sebastián Díaz · solo lectura'),
  ).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Agregar fila' })).toBeNull();
  expect(llamadas.some((l) => l.ruta === '/api/horas?usuario_id=3&semana=2026-09-28')).toBe(true);
});

it('con rol lectura la planilla propia no se edita y lo explica', async () => {
  montar(
    planillaDePrueba({ editable: false, filas: [] }),
    yoDePrueba({ id: 3, nombre: 'Sebastián Díaz', rol: 'lectura' }),
  );
  expect(await screen.findByText('Tu rol no registra horas')).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
});

it('con editable false no hay inputs y las celdas son texto', async () => {
  montar(planillaDePrueba({ editable: false }));
  await esperarPlanilla();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getAllByText('3').length).toBeGreaterThan(0);
});

it('una OT cerrada queda de solo lectura', async () => {
  const fila = filaDePrueba(
    'ot:16',
    destinoOt(16, 'OT-0216', 'Mantención', { etapa: 'cerrada', final: true }),
    [2],
  );
  montar(planillaDePrueba({ filas: [fila] }));
  await screen.findByRole('link', { name: 'OT-0216' });
  expect(screen.queryByLabelText('OT-0216 · Lun 28')).toBeNull();
  expect(screen.getByText('Cerrada')).toBeTruthy();
});

it('sin departamento avisa que no hay jornada para comparar', async () => {
  const base = planillaDePrueba();
  montar({
    ...base,
    usuario: { ...base.usuario, departamento: null },
    dias: base.dias.map((d) => ({ ...d, jornada: null })),
    totales: { ...base.totales, jornada_semanal: null },
  });
  await esperarPlanilla();
  expect(screen.getByText('Sin departamento: no hay jornada para comparar')).toBeTruthy();
  expect(screen.getByText('7,5 h')).toBeTruthy();
});
