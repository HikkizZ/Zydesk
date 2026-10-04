import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { DialogoTerminos } from './DialogoTerminos';

afterEach(() => vi.unstubAllGlobals());

it('al aceptar vuelve a pedir las consultas que fallaron mientras estaba abierto', async () => {
  const llamadas = simularFetch((l) => {
    if (l.ruta === '/api/legal/terminos')
      return respuesta(200, {
        clave: 'terminos',
        version: 'v1',
        titulo: 'Términos de uso',
        contenido_md: '# Términos',
        borrador: false,
      });
    if (l.ruta === '/api/yo/aceptar-terminos') return respuesta(200, yoDePrueba());
    return undefined;
  });
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidar = vi.spyOn(cliente, 'invalidateQueries');
  render(
    <ConSesion yo={yoDePrueba({ debe_aceptar_terminos: true })} cliente={cliente}>
      <DialogoTerminos />
    </ConSesion>,
  );

  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));

  await waitFor(() => expect(invalidar).toHaveBeenCalledWith());
  expect(llamadas.some((l) => l.ruta === '/api/yo/aceptar-terminos')).toBe(true);
});
