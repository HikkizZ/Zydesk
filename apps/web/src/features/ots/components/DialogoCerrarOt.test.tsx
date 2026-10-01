import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type { OtDatos } from '@/features/ots/api';
import { respuesta, simularFetch } from '@/test/fetch';
import { otDePrueba } from '@/test/ots';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { USUARIOS_PRUEBA } from '@/test/tickets';
import { DialogoCerrarOt } from './DialogoCerrarOt';

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});
afterEach(() => vi.unstubAllGlobals());

function montar(
  ot: OtDatos = otDePrueba({ etapa: 'en_ejecucion' }),
  manejador?: Parameters<typeof simularFetch>[0],
) {
  const llamadas = simularFetch(...(manejador ? [manejador] : []), ({ ruta, metodo }) => {
    if (metodo === 'GET' && ruta.startsWith('/api/usuarios'))
      return respuesta(200, USUARIOS_PRUEBA);
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba({ rol: 'coordinacion' })}>
      <DialogoCerrarOt ot={ot} abierto onCerrar={() => {}} />
      <Toaster />
    </ConSesion>,
  );
  return llamadas;
}

const seccion = () => screen.getByRole('region', { name: 'Qué va a pasar' });
const botonCerrar = () =>
  screen.getByRole('button', { name: /^Cerrar OT (y resolver|\()/ }) as HTMLButtonElement;

it('por defecto "Sí": ticket Resuelto y botón deshabilitado sin resumen', async () => {
  montar();
  expect(await screen.findByText('Cerrar OT-0218')).toBeTruthy();
  expect((screen.getByRole('radio', { name: /^Sí/ }) as HTMLInputElement).checked).toBe(true);
  expect(within(seccion()).getByText('Pasa a Resuelto.')).toBeTruthy();
  expect(botonCerrar().textContent).toBe('Cerrar OT y resolver ticket');
  expect(botonCerrar().disabled).toBe(true);
});

it('con otras OT abiertas "Sí" queda deshabilitada y se explica por qué', async () => {
  const ot = otDePrueba({
    etapa: 'en_ejecucion',
    ticket_origen: {
      ...otDePrueba().ticket_origen,
      otras_ots_abiertas: [{ id: 30, codigo: 'OT-0220', etapa: 'borrador' }],
    },
  });
  montar(ot);
  expect((await screen.findByRole('radio', { name: /^Sí/ })) as HTMLInputElement).toHaveProperty(
    'disabled',
    true,
  );
  expect(screen.getByText(/El ticket tiene otras OT abiertas \(OT-0220\)/)).toBeTruthy();
  expect(
    (screen.getByRole('radio', { name: /^No, o solo en parte/ }) as HTMLInputElement).checked,
  ).toBe(true);
});

it('"No" muestra el siguiente paso y el responsable; "Qué va a pasar" cambia con la opción', async () => {
  const usuario = userEvent.setup();
  montar();
  await usuario.click(await screen.findByRole('radio', { name: /^No, o solo en parte/ }));
  expect(screen.getByLabelText('¿Qué pasa con el ticket?')).toBeTruthy();
  expect(
    screen.getByRole('combobox', { name: /Responsable del siguiente paso: Sebastián Díaz/ }),
  ).toBeTruthy();
  expect(
    within(seccion()).getByText(/sigue abierto y vuelve a En curso con Sebastián Díaz/),
  ).toBeTruthy();
  expect(botonCerrar().textContent).toBe('Cerrar OT (ticket sigue abierto)');

  await usuario.click(screen.getByLabelText('¿Qué pasa con el ticket?'));
  await usuario.click(
    await screen.findByRole('option', { name: 'Se crea una nueva OT vinculada' }),
  );
  expect(
    within(seccion()).getByText(/se crea una OT nueva vinculada, a cargo de Sebastián Díaz/),
  ).toBeTruthy();
  expect(screen.getByText('Responsable técnico de la nueva OT')).toBeTruthy();

  await usuario.click(screen.getByLabelText('¿Qué pasa con el ticket?'));
  await usuario.click(await screen.findByRole('option', { name: 'Pasa a En espera' }));
  expect(screen.getByLabelText('¿De quién se espera?')).toBeTruthy();
  expect(within(seccion()).getByText(/pasa a En espera \(por definir\)/)).toBeTruthy();
});

it('el botón se habilita con resumen y envía "Sí" con el resumen', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(otDePrueba({ etapa: 'en_ejecucion' }), ({ metodo, ruta }) => {
    if (metodo === 'POST' && ruta === '/api/ots/21/cerrar') {
      return respuesta(200, otDePrueba({ etapa: 'cerrada' }));
    }
    return undefined;
  });
  await usuario.type(await screen.findByLabelText('Resumen de cierre'), 'Listo, sin errores');
  expect(botonCerrar().disabled).toBe(false);
  await usuario.click(botonCerrar());
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true));
  expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toEqual({
    resolvio_ticket: true,
    resumen: 'Listo, sin errores',
  });
});

it('"No" con nueva OT envía el responsable y avisa la OT creada', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(otDePrueba({ etapa: 'en_ejecucion' }), ({ metodo, ruta }) => {
    if (metodo === 'POST' && ruta === '/api/ots/21/cerrar') {
      return respuesta(
        200,
        otDePrueba({
          etapa: 'cerrada',
          ticket_origen: {
            ...otDePrueba().ticket_origen,
            otras_ots_abiertas: [{ id: 40, codigo: 'OT-0220', etapa: 'borrador' }],
          },
        }),
      );
    }
    return undefined;
  });
  await usuario.click(await screen.findByRole('radio', { name: /^No, o solo en parte/ }));
  await usuario.click(screen.getByLabelText('¿Qué pasa con el ticket?'));
  await usuario.click(
    await screen.findByRole('option', { name: 'Se crea una nueva OT vinculada' }),
  );
  await usuario.type(screen.getByLabelText('Resumen de cierre'), 'Falta capacitación');
  await usuario.click(botonCerrar());
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true));
  expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toEqual({
    resolvio_ticket: false,
    resumen: 'Falta capacitación',
    siguiente: { accion: 'nueva_ot', responsable_id: 3 },
  });
  expect(await screen.findByText('OT-0220 creada')).toBeTruthy();
});

it('409 OT_ABIERTA reemplaza el contenido por la lista de OT con enlaces', async () => {
  const usuario = userEvent.setup();
  montar(otDePrueba({ etapa: 'en_ejecucion' }), ({ metodo, ruta }) => {
    if (metodo === 'POST' && ruta === '/api/ots/21/cerrar') {
      return respuesta(409, {
        error: {
          codigo: 'OT_ABIERTA',
          mensaje: 'El ticket tiene OT abiertas',
          detalles: { ots: [{ id: 40, codigo: 'OT-0220', etapa: 'en_ejecucion' }] },
        },
      });
    }
    return undefined;
  });
  await usuario.type(await screen.findByLabelText('Resumen de cierre'), 'Listo');
  await usuario.click(botonCerrar());
  expect(await screen.findByText('El ticket tiene otras OT abiertas')).toBeTruthy();
  const enlace = screen.getByRole('link', { name: 'OT-0220' });
  expect(enlace.getAttribute('href')).toBe('/ots/40');
  expect(screen.getByText(/En ejecución/)).toBeTruthy();
});

it('una facturable con neto muestra "($475.000 neto)" en "Qué va a pasar"', async () => {
  montar(otDePrueba({ etapa: 'en_ejecucion', neto: 475000 }));
  await screen.findByText('Cerrar OT-0218');
  expect(within(seccion()).getByText(/\(\$475\.000 neto\)/)).toBeTruthy();
});

it('sin neto (sin cotización) no menciona montos', async () => {
  montar(otDePrueba({ etapa: 'en_ejecucion', neto: null }));
  await screen.findByText('Cerrar OT-0218');
  expect(within(seccion()).queryByText(/neto\)/)).toBeNull();
});
