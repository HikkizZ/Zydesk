import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { simularMovil } from '@/test/pantalla';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { USUARIOS_PRUEBA } from '@/test/tickets';
import { RedactorPlegable } from './RedactorPlegable';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function montar(onEnviado?: () => void) {
  const llamadas = simularFetch(({ metodo, ruta }) => {
    if (metodo === 'GET' && ruta.startsWith('/api/usuarios'))
      return respuesta(200, USUARIOS_PRUEBA);
    if (metodo === 'POST' && ruta === '/api/tickets/7/mensajes') return respuesta(201, { id: 1 });
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba()}>
      <RedactorPlegable ticketId={7} {...(onEnviado ? { onEnviado } : {})} />
    </ConSesion>,
  );
  return llamadas;
}

const escribir = () => screen.getByRole('button', { name: 'Escribir seguimiento' });
const texto = () => screen.queryByLabelText('Texto del mensaje') as HTMLTextAreaElement | null;

it('en escritorio muestra el redactor completo sin barra', () => {
  montar();
  expect(screen.getByRole('region', { name: 'Redactor' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Escribir seguimiento' })).toBeNull();
});

it('en móvil muestra una barra con «Escribir seguimiento» y «Tomar foto», sin textarea', () => {
  simularMovil();
  montar();
  expect(escribir()).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeTruthy();
  expect(texto()).toBeNull();
  expect(screen.getByRole('group', { name: 'Redactor' }).parentElement?.className).toContain(
    'sticky',
  );
});

it('«Escribir seguimiento» abre el redactor con foco y quita la barra', async () => {
  simularMovil();
  const usuario = userEvent.setup();
  montar();
  await usuario.click(escribir());
  expect(document.activeElement).toBe(texto());
  expect(screen.queryByRole('button', { name: 'Escribir seguimiento' })).toBeNull();
  expect(screen.getByRole('region', { name: 'Redactor' }).closest('.sticky')).toBeNull();
});

it('«Tomar foto» abre el redactor y dispara la cámara', async () => {
  simularMovil();
  const usuario = userEvent.setup();
  const clic = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
  montar();
  await usuario.click(screen.getByRole('button', { name: 'Tomar foto' }));
  expect(texto()).not.toBeNull();
  const entrada = screen.getByLabelText('Tomar foto') as HTMLInputElement;
  expect(entrada.getAttribute('capture')).toBe('environment');
  expect(clic.mock.contexts).toContain(entrada);
});

it('«Cancelar» sin nada escrito vuelve a la barra', async () => {
  simularMovil();
  const usuario = userEvent.setup();
  montar();
  await usuario.click(escribir());
  await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(texto()).toBeNull();
  expect(escribir()).toBeTruthy();
});

it('«Cancelar» con texto pide confirmar y «Descartar» vuelve a la barra', async () => {
  simularMovil();
  const usuario = userEvent.setup();
  montar();
  await usuario.click(escribir());
  await usuario.type(texto()!, 'Algo');
  await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(await screen.findByText('¿Descartar el seguimiento?')).toBeTruthy();
  await usuario.click(screen.getByRole('button', { name: 'Descartar' }));
  await waitFor(() => expect(texto()).toBeNull());
  expect(escribir()).toBeTruthy();
});

it('tras enviar vuelve a la barra y avisa con onEnviado', async () => {
  simularMovil();
  const usuario = userEvent.setup();
  const onEnviado = vi.fn();
  const llamadas = montar(onEnviado);
  await usuario.click(escribir());
  await usuario.type(texto()!, 'Listo');
  await usuario.click(screen.getByRole('button', { name: 'Registrar seguimiento' }));
  await waitFor(() => expect(onEnviado).toHaveBeenCalledTimes(1));
  expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/api/tickets/7/mensajes')).toBe(
    true,
  );
  expect(texto()).toBeNull();
  expect(escribir()).toBeTruthy();
});
