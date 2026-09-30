import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { DialogoCambiarEstado } from './DialogoCambiarEstado';

afterEach(() => vi.unstubAllGlobals());

const montar = (estado: 'en_curso' | 'resuelto') => {
  simularFetch(() => respuesta(200, { datos: [], total: 0, pagina: 1, por_pagina: 8 }));
  render(
    <ConSesion yo={yoDePrueba()}>
      <DialogoCambiarEstado
        ticket={{ id: 7, codigo: 'TK-1048', estado }}
        abierto
        onCerrar={() => {}}
      />
    </ConSesion>,
  );
};

const botonCambiar = () =>
  screen.getByRole('button', { name: 'Cambiar estado' }) as HTMLButtonElement;

it('muestra "¿De quién se espera?" solo al elegir En espera', async () => {
  const usuario = userEvent.setup();
  montar('en_curso');
  expect(screen.queryByText('¿De quién se espera?')).toBeNull();
  await usuario.click(screen.getByRole('radio', { name: /En espera/ }));
  expect(screen.getByText('¿De quién se espera?')).toBeTruthy();
  expect(botonCambiar().disabled).toBe(true);
  await usuario.click(screen.getByRole('radio', { name: /Descartado/ }));
  expect(screen.queryByText('¿De quién se espera?')).toBeNull();
  expect(screen.getByLabelText('Motivo')).toBeTruthy();
});

it('ofrece los 5 destinos de un ticket abierto', () => {
  montar('en_curso');
  expect(screen.getAllByRole('radio')).toHaveLength(5);
});

it('un ticket cerrado solo ofrece Reabrir (En curso)', () => {
  montar('resuelto');
  expect(screen.getAllByRole('radio')).toHaveLength(1);
  expect(screen.getByText('Reabrir (En curso)')).toBeTruthy();
  expect(botonCambiar().disabled).toBe(false);
});
