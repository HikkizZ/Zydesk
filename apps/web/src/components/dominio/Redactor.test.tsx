import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { USUARIOS_PRUEBA } from '@/test/tickets';
import { Redactor } from './Redactor';

afterEach(() => vi.unstubAllGlobals());

function montar(onEnviado?: () => void) {
  const llamadas = simularFetch(({ metodo, ruta }) => {
    if (metodo === 'GET' && ruta.startsWith('/api/usuarios'))
      return respuesta(200, USUARIOS_PRUEBA);
    if (metodo === 'POST' && ruta === '/api/tickets/7/mensajes') return respuesta(201, { id: 1 });
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba()}>
      <Redactor ticketId={7} {...(onEnviado ? { onEnviado } : {})} />
      <Toaster />
    </ConSesion>,
  );
  return llamadas;
}

const boton = (nombre: string) => screen.getByRole('button', { name: nombre }) as HTMLButtonElement;

it('alterna entre seguimiento y nota interna y deshabilita el botón sin texto', async () => {
  const usuario = userEvent.setup();
  montar();
  expect(boton('Registrar seguimiento').disabled).toBe(true);
  expect(boton('Seguimiento').getAttribute('aria-pressed')).toBe('true');

  await usuario.click(boton('Nota interna'));
  expect(boton('Nota interna').getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText(/Contexto solo para el equipo/)).toBeTruthy();
  expect(boton('Guardar nota').disabled).toBe(true);
  await usuario.type(screen.getByLabelText('Texto del mensaje'), 'Algo');
  expect(boton('Guardar nota').disabled).toBe(false);
});

it('la ayuda de las horas explica la planilla y enlaza a /horas', async () => {
  montar();
  expect(screen.getByText(/Se suman a tu planilla de hoy; corrígelas en/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Horas' }).getAttribute('href')).toBe('/horas');
});

it('el enlace «Horas» es un enlace en línea declarado', () => {
  montar();
  expect(screen.getByRole('link', { name: 'Horas' }).getAttribute('data-objetivo')).toBe(
    'en-linea',
  );
});

it('al teclear @ abre la lista, inserta el nombre y envía el id mencionado con las horas', async () => {
  const usuario = userEvent.setup();
  const onEnviado = vi.fn();
  const llamadas = montar(onEnviado);
  await usuario.click(boton('Nota interna'));
  await usuario.type(screen.getByLabelText('Texto del mensaje'), 'Hola @seb');

  const opcion = await screen.findByRole('option', { name: /Sebastián Díaz/ });
  expect(screen.queryByRole('option', { name: /Camila/ })).toBeNull();
  await usuario.click(opcion);
  expect((screen.getByLabelText('Texto del mensaje') as HTMLTextAreaElement).value).toBe(
    'Hola @Sebastián Díaz ',
  );

  await usuario.type(screen.getByLabelText('Horas'), '1.5');
  await usuario.click(boton('Guardar nota'));

  await waitFor(() => expect(onEnviado).toHaveBeenCalled());
  const envio = llamadas.find((l) => l.metodo === 'POST');
  expect(envio?.cuerpo).toMatchObject({
    tipo: 'nota_interna',
    texto: 'Hola @Sebastián Díaz',
    mencionados_ids: [3],
    horas: 1.5,
  });
  expect((screen.getByLabelText('Texto del mensaje') as HTMLTextAreaElement).value).toBe('');
});

it('no envía la mención si se borra el nombre del texto', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  const area = screen.getByLabelText('Texto del mensaje');
  await usuario.type(area, '@dieg');
  await usuario.click(await screen.findByRole('option', { name: /Diego Muñoz/ }));
  await usuario.clear(area);
  await usuario.type(area, 'Sin mención');
  await usuario.click(boton('Registrar seguimiento'));
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true));
  expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toMatchObject({ mencionados_ids: [] });
});

it('en una OT con copiaAlTicket envía copiar_al_ticket al endpoint de la OT', async () => {
  const usuario = userEvent.setup();
  const llamadas = simularFetch(({ metodo, ruta }) => {
    if (metodo === 'GET' && ruta.startsWith('/api/usuarios'))
      return respuesta(200, USUARIOS_PRUEBA);
    if (metodo === 'POST' && ruta === '/api/ots/5/mensajes') return respuesta(201, { id: 1 });
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba()}>
      <Redactor destino={{ tipo: 'ot', id: 5 }} copiaAlTicket codigoTicket="TK-1048" />
      <Toaster />
    </ConSesion>,
  );
  expect(screen.getByText('El avance también queda en TK-1048')).toBeTruthy();
  await usuario.type(screen.getByLabelText('Texto del mensaje'), 'Listo');
  await usuario.click(screen.getByRole('checkbox', { name: 'Copiar al ticket' }));
  await usuario.click(boton('Registrar seguimiento'));
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true));
  expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toMatchObject({
    tipo: 'seguimiento',
    texto: 'Listo',
    copiar_al_ticket: true,
  });
});

it('sin copiaAlTicket no hay casilla ni se envía copiar_al_ticket', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  expect(screen.queryByRole('checkbox', { name: 'Copiar al ticket' })).toBeNull();
  await usuario.type(screen.getByLabelText('Texto del mensaje'), 'Algo');
  await usuario.click(boton('Registrar seguimiento'));
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true));
  expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).not.toHaveProperty('copiar_al_ticket');
});
