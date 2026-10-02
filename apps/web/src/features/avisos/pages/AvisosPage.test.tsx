import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import type { AvisoDatos, PreferenciasDatos, TelegramEstadoDatos } from '@/features/avisos/api';
import {
  AVISOS_DISENO,
  avisosDePrueba,
  preferenciasDePrueba,
  telegramDePrueba,
} from '@/test/avisos';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { AvisosPage } from './AvisosPage';

afterEach(() => vi.unstubAllGlobals());

function Ubicacion() {
  const { pathname, search } = useLocation();
  return <div data-testid="ubicacion">{pathname + search}</div>;
}

interface Estado {
  avisos: AvisoDatos[];
  preferencias: PreferenciasDatos;
  telegram: TelegramEstadoDatos;
}

function montar(inicial: Partial<Estado> = {}, ruta = '/avisos') {
  const estado: Estado = {
    avisos: AVISOS_DISENO.map((a) => ({ ...a })),
    preferencias: preferenciasDePrueba(false),
    telegram: telegramDePrueba(),
    ...inicial,
  };
  const llamadas = simularFetch(({ ruta, metodo }) => {
    if (ruta.startsWith('/api/avisos/leer-todos')) {
      estado.avisos = estado.avisos.map((a) => ({ ...a, leido: true }));
      return respuesta(200, { marcados: 3 });
    }
    const leer = /^\/api\/avisos\/(\d+)\/leer$/.exec(ruta);
    if (leer && metodo === 'POST') {
      const id = Number(leer[1]);
      estado.avisos = estado.avisos.map((a) => (a.id === id ? { ...a, leido: true } : a));
      return respuesta(
        200,
        estado.avisos.find((a) => a.id === id),
      );
    }
    if (ruta.startsWith('/api/avisos/no-leidos')) {
      return respuesta(200, { no_leidos: estado.avisos.filter((a) => !a.leido).length });
    }
    if (ruta.startsWith('/api/avisos')) {
      const filtro = new URL(ruta, 'http://x').searchParams.get('filtro');
      const soloNo = new URL(ruta, 'http://x').searchParams.get('solo_no_leidos') === 'true';
      const datos = estado.avisos.filter(
        (a) => (filtro === null || a.evento === 'mencion') && (!soloNo || !a.leido),
      );
      return respuesta(
        200,
        avisosDePrueba(datos, {
          no_leidos: estado.avisos.filter((a) => !a.leido).length,
        }),
      );
    }
    if (ruta === '/api/yo/avisos/preferencias') {
      if (metodo === 'PUT') return respuesta(200, estado.preferencias);
      return respuesta(200, estado.preferencias);
    }
    if (ruta === '/api/yo/telegram/codigo' && metodo === 'POST') {
      return respuesta(201, {
        codigo: 'AB23CDEF',
        expira_en: new Date(Date.now() + 10 * 60_000).toISOString(),
        enlace: 'https://t.me/zydesk_dev_bot?start=AB23CDEF',
      });
    }
    if (ruta === '/api/yo/telegram') {
      if (metodo === 'DELETE') {
        estado.telegram = telegramDePrueba();
        return respuesta(204);
      }
      return respuesta(200, estado.telegram);
    }
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba()} ruta={ruta}>
      <Routes>
        <Route
          path="/avisos"
          element={
            <>
              <AvisosPage />
              <Ubicacion />
            </>
          }
        />
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </ConSesion>,
  );
  return { llamadas, estado };
}

const esperarLista = () => screen.findByText('Camila Rojas te mencionó en TK-1048');

it('con los 8 avisos del diseño (3 sin leer) el contador dice «3 sin leer» y hay 3 puntos', async () => {
  montar();
  await esperarLista();
  expect(screen.getByText('3 sin leer')).toBeTruthy();
  expect(screen.getAllByRole('img', { name: 'Sin leer' })).toHaveLength(3);
  expect(screen.getAllByRole('link', { name: /TK-|OT-/ })).toHaveLength(8);
});

it('cada aviso trae el glifo por evento con aria-label y el icono de Telegram', async () => {
  montar();
  await esperarLista();
  expect(screen.getAllByRole('img', { name: 'Mención' })).toHaveLength(1);
  expect(screen.getAllByRole('img', { name: 'Vencimiento' })).toHaveLength(2);
  expect(screen.getAllByRole('img', { name: 'Asignación' })).toHaveLength(1);
  expect(screen.getByRole('img', { name: 'Enviado por Telegram' })).toBeTruthy();
  expect(screen.getByRole('img', { name: 'No se pudo enviar por Telegram' })).toBeTruthy();
});

it('los chips filtran por `filtro` en la URL y piden la lista filtrada', async () => {
  const { llamadas } = montar();
  await esperarLista();
  await userEvent.click(screen.getByRole('button', { name: 'Menciones' }));
  await waitFor(() =>
    expect(screen.getByTestId('ubicacion').textContent).toBe('/avisos?filtro=menciones'),
  );
  await waitFor(() =>
    expect(
      llamadas.some((l) => l.ruta.includes('/api/avisos?') && l.ruta.includes('filtro=menciones')),
    ).toBe(true),
  );
  expect(screen.getByRole('button', { name: 'Menciones' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
  await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/avisos'));
});

it('«Solo sin leer» pone `no_leidos=true` en la URL', async () => {
  const { llamadas } = montar();
  await esperarLista();
  await userEvent.click(screen.getByRole('switch', { name: 'Solo sin leer' }));
  await waitFor(() =>
    expect(screen.getByTestId('ubicacion').textContent).toBe('/avisos?no_leidos=true'),
  );
  await waitFor(() =>
    expect(llamadas.some((l) => l.ruta.includes('solo_no_leidos=true'))).toBe(true),
  );
});

it('pulsar un aviso llama a marcarLeido y navega al enlace', async () => {
  const { llamadas } = montar();
  await esperarLista();
  await userEvent.click(screen.getByRole('link', { name: /te asignó TK-1052/ }));
  expect(await screen.findByTestId('ubicacion')).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/tickets/1052'));
  expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/api/avisos/7/leer')).toBe(true);
});

it('«Marcar todo como leído» llama a la API y deja 0 sin leer', async () => {
  const { llamadas } = montar();
  await esperarLista();
  await userEvent.click(screen.getByRole('button', { name: 'Marcar todo como leído' }));
  await waitFor(() => expect(screen.getByText('0 sin leer')).toBeTruthy());
  expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/api/avisos/leer-todos')).toBe(
    true,
  );
  expect(
    (screen.getByRole('button', { name: 'Marcar todo como leído' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

it('al entrar no se marca nada como leído', async () => {
  const { llamadas } = montar();
  await esperarLista();
  expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(0);
});

it('sin avisos muestra «Sin avisos»', async () => {
  montar({ avisos: [] });
  expect(await screen.findByText('Sin avisos')).toBeTruthy();
});

it('la tabla de preferencias tiene 9 filas y 17 switches, ninguno de correo', async () => {
  montar();
  const tabla = await screen.findByRole('table', { name: 'Preferencias de avisos' });
  expect(within(tabla).getAllByRole('row')).toHaveLength(10); // cabecera + 9
  expect(within(tabla).getAllByRole('switch')).toHaveLength(17);
  expect(within(tabla).queryByText(/correo/i)).toBeNull();
  expect(screen.queryByLabelText(/correo/i)).toBeNull();
  expect(
    within(tabla).getByRole('switch', { name: 'Me mencionan con @ por Telegram' }),
  ).toBeTruthy();
});

it('con telegram_vinculado: false aparece «Vincula Telegram para recibirlos»; vinculado no', async () => {
  montar();
  expect(await screen.findByText('Vincula Telegram para recibirlos')).toBeTruthy();
});

it('con telegram_vinculado: true no aparece el texto de vincular', async () => {
  montar({ preferencias: preferenciasDePrueba(true) });
  await screen.findByRole('table', { name: 'Preferencias de avisos' });
  expect(screen.queryByText('Vincula Telegram para recibirlos')).toBeNull();
});

it('cambiar un switch guarda solo esa fila y actualiza de inmediato', async () => {
  const { llamadas } = montar();
  const tabla = await screen.findByRole('table', { name: 'Preferencias de avisos' });
  const sw = within(tabla).getByRole('switch', {
    name: 'Cambia el estado de un ticket que sigo por Telegram',
  });
  expect(sw.getAttribute('aria-checked')).toBe('false');
  await userEvent.click(sw);
  await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'));
  const put = llamadas.find((l) => l.metodo === 'PUT');
  expect(put?.ruta).toBe('/api/yo/avisos/preferencias');
  expect(put?.cuerpo).toEqual({
    filas: [{ evento: 'estado_ticket', app: true, telegram: true }],
  });
});

it('la fila del resumen diario solo tiene el switch de Telegram', async () => {
  montar();
  const tabla = await screen.findByRole('table', { name: 'Preferencias de avisos' });
  expect(within(tabla).queryByRole('switch', { name: /Resumen diario.*en la app/ })).toBeNull();
  expect(within(tabla).getByRole('switch', { name: /Resumen diario.*por Telegram/ })).toBeTruthy();
});

it('«Vincular Telegram» muestra el código de la API y la expiración', async () => {
  montar();
  await userEvent.click(await screen.findByRole('button', { name: 'Vincular Telegram' }));
  const dialogo = await screen.findByRole('dialog', { name: 'Vincular Telegram' });
  expect((await within(dialogo).findByTestId('codigo-vinculo')).textContent).toBe('AB23CDEF');
  expect(within(dialogo).getByText(/Expira en (9|10):/)).toBeTruthy();
  expect(within(dialogo).getByRole('button', { name: 'Copiar' })).toBeTruthy();
  expect(within(dialogo).getByRole('button', { name: 'Generar otro código' })).toBeTruthy();
  expect(
    within(dialogo).getByRole('link', { name: 'Abrir en Telegram' }).getAttribute('href'),
  ).toBe('https://t.me/zydesk_dev_bot?start=AB23CDEF');
  expect(within(dialogo).getByText('/vincular AB23CDEF')).toBeTruthy();
});

it('cuando el sondeo devuelve vinculado: true muestra el éxito', async () => {
  const { estado } = montar();
  await userEvent.click(await screen.findByRole('button', { name: 'Vincular Telegram' }));
  const dialogo = await screen.findByRole('dialog', { name: 'Vincular Telegram' });
  await within(dialogo).findByTestId('codigo-vinculo');
  estado.telegram = telegramDePrueba({
    vinculado: true,
    telegram_usuario: 'crojas',
    vinculado_en: '2026-10-02T12:00:00.000Z',
    sesion_bot_activa: true,
  });
  expect(
    await within(dialogo).findByText('¡Listo! Vinculado como @crojas', {}, { timeout: 5000 }),
  ).toBeTruthy();
}, 10000);

it('vinculado: muestra usuario y fecha; «Desvincular» exige confirmar', async () => {
  const { llamadas } = montar({
    telegram: telegramDePrueba({
      vinculado: true,
      telegram_usuario: 'crojas',
      vinculado_en: '2026-10-01T15:00:00.000Z',
      sesion_bot_activa: true,
    }),
    preferencias: preferenciasDePrueba(true),
  });
  expect(await screen.findByText('Vinculado · @crojas · desde 1 oct')).toBeTruthy();
  expect(screen.queryByText(/caducaron/)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Desvincular' }));
  const confirmar = await screen.findByRole('alertdialog');
  expect(within(confirmar).getByText(/el bot cerrará tu sesión/)).toBeTruthy();
  expect(llamadas.some((l) => l.metodo === 'DELETE')).toBe(false);
  await userEvent.click(within(confirmar).getByRole('button', { name: 'Desvincular' }));
  await waitFor(() =>
    expect(llamadas.some((l) => l.metodo === 'DELETE' && l.ruta === '/api/yo/telegram')).toBe(true),
  );
  expect(await screen.findByRole('button', { name: 'Vincular Telegram' })).toBeTruthy();
});

it('vinculado con la sesión del bot caducada avisa y ofrece «Generar código»', async () => {
  montar({
    telegram: telegramDePrueba({
      vinculado: true,
      telegram_usuario: 'crojas',
      vinculado_en: '2026-10-01T15:00:00.000Z',
      sesion_bot_activa: false,
    }),
  });
  expect(
    await screen.findByText('Los comandos del bot caducaron: envía /vincular con un código nuevo'),
  ).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Generar código' }));
  const dialogo = await screen.findByRole('dialog', { name: 'Vincular Telegram' });
  // el vínculo ya existía: no se da por listo hasta que la sesión del bot vuelva a estar activa
  expect((await within(dialogo).findByTestId('codigo-vinculo')).textContent).toBe('AB23CDEF');
  expect(within(dialogo).queryByText(/¡Listo!/)).toBeNull();
});

it('con disponible: false no hay botón y se explica', async () => {
  montar({ telegram: telegramDePrueba({ disponible: false }) });
  expect(
    await screen.findByText('El bot de Telegram no está configurado en este servidor'),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Vincular Telegram' })).toBeNull();
});

it('si la API no ofrece /api/yo/telegram la tarjeta no se muestra', async () => {
  const llamadas = simularFetch(({ ruta }) => {
    if (ruta.startsWith('/api/avisos')) return respuesta(200, avisosDePrueba());
    if (ruta === '/api/yo/avisos/preferencias') return respuesta(200, preferenciasDePrueba(false));
    return undefined; // /api/yo/telegram → 404
  });
  render(
    <ConSesion yo={yoDePrueba()} ruta="/avisos">
      <AvisosPage />
    </ConSesion>,
  );
  await esperarLista();
  await waitFor(() => expect(llamadas.some((l) => l.ruta === '/api/yo/telegram')).toBe(true));
  expect(screen.queryByRole('heading', { name: 'Telegram' })).toBeNull();
});
