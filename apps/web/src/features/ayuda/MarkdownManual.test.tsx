import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MarkdownManual } from './MarkdownManual';

it('una imagen del bundle se muestra con alt, carga diferida y src', () => {
  const { container } = render(
    <MarkdownManual carpeta="usuario" texto="![Detalle](../img/tecnico/detalle-ticket.png)" />,
  );
  const img = container.querySelector('img[alt="Detalle"][loading="lazy"]');
  expect(img).not.toBeNull();
  expect(img!.getAttribute('src')).toBeTruthy();
});

it('una imagen que no existe muestra el recuadro y ningún img', () => {
  const { container } = render(
    <MarkdownManual carpeta="usuario" texto="![Falta](../img/tecnico/no-existe.png)" />,
  );
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByRole('img', { name: 'Falta' }).textContent).toBe(
    'Imagen no disponible: Falta',
  );
});

it('una imagen externa nunca se pide a la red', () => {
  const { container } = render(
    <MarkdownManual carpeta="usuario" texto="![Pixel](https://evil.example/x.png)" />,
  );
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByRole('img', { name: 'Pixel' })).toBeTruthy();
});

it('sin alt no se muestra la imagen', () => {
  const { container } = render(
    <MarkdownManual carpeta="usuario" texto="![](../img/tecnico/detalle-ticket.png)" />,
  );
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByRole('img', { name: 'Imagen sin descripción' })).toBeTruthy();
});
