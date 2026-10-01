import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { celdaDePrueba, planillaDePrueba, registroDePrueba } from '@/test/horas';
import { CeldaHoras } from './CeldaHoras';
import { ResumenSemana } from './ResumenSemana';
import { SelectorSemana } from './SelectorSemana';

afterEach(() => vi.useRealTimers());

function celda(
  props: Partial<React.ComponentProps<typeof CeldaHoras>> & {
    celda?: React.ComponentProps<typeof CeldaHoras>['celda'];
  } = {},
) {
  const onGuardar = vi.fn(async () => {});
  const onAlternar = vi.fn(async () => {});
  const onAbrir = vi.fn();
  render(
    <CeldaHoras
      celda={props.celda ?? celdaDePrueba('2026-09-28', [])}
      etiqueta="OT-0218 · Lun 28"
      editable
      onGuardar={onGuardar}
      onAlternarFueraDeHorario={onAlternar}
      onAbrirDetalle={onAbrir}
      {...props}
    />,
  );
  return { onGuardar, onAlternar, onAbrir };
}

it('CeldaHoras acepta coma decimal y emite el número al salir del campo', async () => {
  const usuario = userEvent.setup();
  const { onGuardar } = celda();
  await usuario.type(screen.getByLabelText('OT-0218 · Lun 28'), '2,5');
  expect(onGuardar).not.toHaveBeenCalled();
  await usuario.tab();
  expect(onGuardar).toHaveBeenCalledExactlyOnceWith(2.5);
});

it('CeldaHoras guarda con Enter', async () => {
  const usuario = userEvent.setup();
  const { onGuardar } = celda();
  await usuario.type(screen.getByLabelText('OT-0218 · Lun 28'), '1.25{Enter}');
  expect(onGuardar).toHaveBeenCalledExactlyOnceWith(1.25);
});

it('CeldaHoras emite null al vaciar una celda con horas', async () => {
  const usuario = userEvent.setup();
  const { onGuardar } = celda({
    celda: celdaDePrueba('2026-09-28', [registroDePrueba('2026-09-28', 3)]),
  });
  const campo = screen.getByLabelText('OT-0218 · Lun 28') as HTMLInputElement;
  expect(campo.value).toBe('3');
  await usuario.clear(campo);
  await usuario.tab();
  expect(onGuardar).toHaveBeenCalledExactlyOnceWith(null);
});

it('CeldaHoras no emite nada si el valor no cambió o está vacío', async () => {
  const usuario = userEvent.setup();
  const { onGuardar } = celda();
  await usuario.click(screen.getByLabelText('OT-0218 · Lun 28'));
  await usuario.tab();
  expect(onGuardar).not.toHaveBeenCalled();
});

it('CeldaHoras rechaza valores que no son múltiplo de 0,25 y vuelve al anterior', async () => {
  const usuario = userEvent.setup();
  const { onGuardar } = celda();
  const campo = screen.getByLabelText('OT-0218 · Lun 28') as HTMLInputElement;
  await usuario.type(campo, '0,1');
  await usuario.tab();
  expect(onGuardar).not.toHaveBeenCalled();
  expect(campo.value).toBe('');
  expect(campo.getAttribute('aria-invalid')).toBe('true');
});

it('CeldaHoras vuelve al valor anterior y marca el error si guardar falla', async () => {
  const usuario = userEvent.setup();
  const onGuardar = vi.fn(async () => {
    throw new Error('x');
  });
  celda({
    celda: celdaDePrueba('2026-09-28', [registroDePrueba('2026-09-28', 3)]),
    onGuardar,
  });
  const campo = screen.getByLabelText('OT-0218 · Lun 28') as HTMLInputElement;
  await usuario.clear(campo);
  await usuario.type(campo, '5');
  await usuario.tab();
  expect(onGuardar).toHaveBeenCalledWith(5);
  expect(campo.value).toBe('3');
  expect(campo.getAttribute('aria-invalid')).toBe('true');
});

it('CeldaHoras con registros de seguimiento no tiene input y abre el detalle', async () => {
  const usuario = userEvent.setup();
  const { onAbrir } = celda({
    celda: celdaDePrueba('2026-09-28', [
      registroDePrueba('2026-09-28', 3, {
        mensaje_id: 5,
        mensaje: { id: 5, tipo: 'seguimiento' },
      }),
    ]),
  });
  expect(screen.queryByRole('textbox')).toBeNull();
  await usuario.click(screen.getByRole('button', { name: /ver detalle/ }));
  expect(onAbrir).toHaveBeenCalled();
});

it('CeldaHoras alterna "Fuera de horario" sobre la fila manual', async () => {
  const usuario = userEvent.setup();
  const { onAlternar } = celda({
    celda: celdaDePrueba('2026-09-28', [registroDePrueba('2026-09-28', 2)]),
  });
  const luna = screen.getByRole('button', { name: /Fuera de horario/ });
  expect(luna.getAttribute('aria-pressed')).toBe('false');
  await usuario.click(luna);
  expect(onAlternar).toHaveBeenCalledWith(true);
});

it('CeldaHoras sin edición es solo texto', () => {
  celda({
    editable: false,
    celda: celdaDePrueba('2026-09-28', [registroDePrueba('2026-09-28', 3.5)]),
  });
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByText('3,5')).toBeTruthy();
});

it('ResumenSemana con los datos del diseño muestra 12 h, 8,5 h y 3,5 h', () => {
  render(<ResumenSemana totales={planillaDePrueba().totales} />);
  expect(screen.getByTestId('total-semana').textContent).toBe('12 h');
  expect(screen.getByTestId('jornada-semana').textContent).toBe('41 h');
  expect(screen.getByText('8,5 h')).toBeTruthy();
  expect(screen.getByText('3,5 h')).toBeTruthy();
  expect(screen.getByText('Fuera de horario')).toBeTruthy();
});

it('ResumenSemana sin jornada avisa que no hay con qué comparar', () => {
  render(<ResumenSemana totales={{ ...planillaDePrueba().totales, jornada_semanal: null }} />);
  expect(screen.getByText('Sin jornada para comparar')).toBeTruthy();
});

it('SelectorSemana navega y deshabilita "Siguiente" si la semana siguiente es futura', async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-01T15:00:00Z') });
  const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const onCambiar = vi.fn();
  render(
    <SelectorSemana semana={planillaDePrueba().semana} onCambiar={onCambiar} onHoy={() => {}} />,
  );
  expect(screen.getByText('Semana del 28 sep al 4 oct 2026')).toBeTruthy();
  expect((screen.getByRole('button', { name: /Siguiente/ }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.queryByRole('button', { name: 'Hoy' })).toBeNull();
  await usuario.click(screen.getByRole('button', { name: /Semana anterior/ }));
  expect(onCambiar).toHaveBeenCalledWith('2026-09-21');
});

it('SelectorSemana muestra "Hoy" fuera de la semana actual y habilita "Siguiente"', () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-01T15:00:00Z') });
  render(
    <SelectorSemana
      semana={{
        desde: '2026-09-21',
        hasta: '2026-09-27',
        anterior: '2026-09-14',
        siguiente: '2026-09-28',
        actual: false,
      }}
      onCambiar={() => {}}
      onHoy={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: 'Hoy' })).toBeTruthy();
  expect((screen.getByRole('button', { name: /Siguiente/ }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});
