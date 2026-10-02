import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { PerfilPage } from './PerfilPage';

afterEach(() => vi.unstubAllGlobals());

const base = {
  ip: '127.0.0.1',
  creada_en: '2026-10-01T12:00:00.000Z',
  ultimo_uso: '2026-10-02T12:00:00.000Z',
  expira_en: '2026-10-31T12:00:00.000Z',
  mantener: false,
};

it('una sesión de origen bot se muestra como «Bot de Telegram» y se puede cerrar', async () => {
  simularFetch(({ ruta }) => {
    if (ruta === '/api/yo/sesiones') {
      return respuesta(200, [
        {
          ...base,
          id: '11111111-1111-4111-8111-111111111111',
          origen: 'web',
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36',
          actual: true,
        },
        {
          ...base,
          id: '22222222-2222-4222-8222-222222222222',
          origen: 'bot',
          user_agent: null,
          actual: false,
        },
      ]);
    }
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba()} ruta="/perfil">
      <PerfilPage />
    </ConSesion>,
  );
  expect(await screen.findByText('Bot de Telegram')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Cerrar' })).toHaveLength(1);
});
