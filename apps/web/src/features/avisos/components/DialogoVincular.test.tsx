import { render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { telegramDePrueba } from '@/test/avisos';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { DialogoVincular } from './DialogoVincular';

afterEach(() => vi.unstubAllGlobals());

const NOMBRE_QR = 'Código QR para vincular Telegram';

function montar(enlace: string | null, escritorio = true) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({
      matches: q.includes('min-width') ? escritorio : !escritorio,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  simularFetch(({ ruta, metodo }) => {
    if (ruta === '/api/yo/telegram/codigo' && metodo === 'POST') {
      return respuesta(201, {
        codigo: 'AB23CDEF',
        expira_en: new Date(Date.now() + 10 * 60_000).toISOString(),
        enlace,
      });
    }
    if (ruta === '/api/yo/telegram') return respuesta(200, telegramDePrueba());
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba()}>
      <DialogoVincular abierto yaVinculado={false} alCambiar={() => {}} />
    </ConSesion>,
  );
  return screen.findByRole('dialog', { name: 'Vincular Telegram' });
}

const AVISO = 'No compartas este código ni el QR: vence en 10 minutos y sirve una sola vez.';

it('escritorio con enlace de t.me: muestra el QR con su texto, el código y el botón', async () => {
  const dialogo = await montar('https://t.me/zydesk_dev_bot?start=AB23CDEF');
  await within(dialogo).findByTestId('codigo-vinculo');
  const qr = await within(dialogo).findByRole('img', { name: NOMBRE_QR });
  expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  expect(within(dialogo).getByText('Escanéalo con la cámara de tu celular')).toBeTruthy();
  expect(within(dialogo).getByRole('link', { name: 'Abrir en Telegram' })).toBeTruthy();
  expect(within(dialogo).getByText(AVISO)).toBeTruthy();
});

it('celular: sin QR, pero con código, botón y aviso', async () => {
  const dialogo = await montar('https://t.me/zydesk_dev_bot?start=AB23CDEF', false);
  await within(dialogo).findByTestId('codigo-vinculo');
  expect(within(dialogo).queryByRole('img', { name: NOMBRE_QR })).toBeNull();
  expect(within(dialogo).queryByText('Escanéalo con la cámara de tu celular')).toBeNull();
  expect(within(dialogo).getByRole('link', { name: 'Abrir en Telegram' })).toBeTruthy();
  expect(within(dialogo).getByText(AVISO)).toBeTruthy();
});

it.each([null, 'https://evil.example/x?start=AB23CDEF'])(
  'enlace %s: ni QR ni botón, pero sí el aviso',
  async (enlace) => {
    const dialogo = await montar(enlace);
    await within(dialogo).findByTestId('codigo-vinculo');
    expect(within(dialogo).queryByRole('img', { name: NOMBRE_QR })).toBeNull();
    expect(within(dialogo).queryByRole('link', { name: 'Abrir en Telegram' })).toBeNull();
    expect(within(dialogo).getByText(AVISO)).toBeTruthy();
  },
);
