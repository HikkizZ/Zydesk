import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ArchivoDatos } from '@/features/tickets/api';
import { archivoDePrueba, archivoSubido, simularArchivos } from '@/test/archivos';
import { respuesta, simularFetch } from '@/test/fetch';
import { SubidaArchivos } from './SubidaArchivos';

const comprimir = vi.hoisted(() => vi.fn(async (f: File) => f));
vi.mock('browser-image-compression', () => ({ default: comprimir }));

const crear = vi.fn();
const revocar = vi.fn();
let n = 0;

beforeEach(() => {
  n = 0;
  crear.mockImplementation(() => `blob:prueba-${++n}`);
  URL.createObjectURL = crear;
  URL.revokeObjectURL = revocar;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  crear.mockReset();
  revocar.mockReset();
  comprimir.mockClear();
});

function Anfitrion(props: { abrirCamaraAlMontar?: boolean } = {}) {
  const [archivos, setArchivos] = useState<ArchivoDatos[]>([]);
  return <SubidaArchivos compacto archivos={archivos} onChange={setArchivos} {...props} />;
}

const camara = () => screen.getByLabelText('Tomar foto') as HTMLInputElement;
const jpg = (nombre: string) => archivoDePrueba(nombre, 'image/jpeg');

it('el input de cámara pide la cámara trasera y acepta varias imágenes', () => {
  simularArchivos();
  render(<Anfitrion />);
  expect(camara().getAttribute('accept')).toBe('image/*');
  expect(camara().getAttribute('capture')).toBe('environment');
  expect(camara().multiple).toBe(true);
});

it('muestra vistas previas locales y el contador, que desaparece al terminar', async () => {
  const usuario = userEvent.setup();
  const puertas: (() => void)[] = [];
  simularFetch(({ metodo, ruta }) => {
    if (metodo === 'POST' && ruta === '/api/archivos')
      return new Promise<Response>((resolver) =>
        puertas.push(() =>
          resolver(respuesta(201, [archivoSubido(puertas.length, `f${puertas.length}.jpg`)])),
        ),
      );
    return undefined;
  });
  const { container } = render(<Anfitrion />);
  await usuario.upload(camara(), [jpg('a.jpg'), jpg('b.jpg')]);

  expect(container.querySelectorAll('img[src^="blob:"]')).toHaveLength(2);
  expect(await screen.findByText('0 de 2 fotos subidas')).toBeTruthy();

  await waitFor(() => expect(puertas).toHaveLength(1));
  puertas[0]!();
  expect(await screen.findByText('1 de 2 fotos subidas')).toBeTruthy();

  await waitFor(() => expect(puertas).toHaveLength(2));
  puertas[1]!();
  await waitFor(() => expect(screen.queryByText(/fotos subidas/)).toBeNull());
  expect(screen.getAllByRole('button', { name: /^Quitar/ })).toHaveLength(2);
  expect(container.querySelectorAll('img[src^="blob:"]')).toHaveLength(2);
});

it('con un solo archivo dice «Subiendo 1 archivo…»', async () => {
  const usuario = userEvent.setup();
  simularFetch(({ metodo }) =>
    metodo === 'POST' ? new Promise<Response>(() => undefined) : undefined,
  );
  render(<Anfitrion />);
  await usuario.upload(camara(), jpg('a.jpg'));
  expect(await screen.findByText('Subiendo 1 archivo…')).toBeTruthy();
});

it('una subida fallida muestra el motivo y «Reintentar» repite el POST', async () => {
  const usuario = userEvent.setup();
  const llamadas = simularArchivos({ fallaLaSubida: 2 });
  render(<Anfitrion />);
  await usuario.upload(camara(), [jpg('a.jpg'), jpg('b.jpg')]);

  expect(await screen.findByText('Tipo de archivo no permitido.')).toBeTruthy();
  expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(2);

  await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(screen.queryByText('Tipo de archivo no permitido.')).toBeNull());
  expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(3);
  expect(screen.getAllByRole('button', { name: /^Quitar/ })).toHaveLength(2);
});

it('quitar un fallido no llama a DELETE; quitar uno subido sí', async () => {
  const usuario = userEvent.setup();
  const llamadas = simularArchivos({ fallaLaSubida: 2 });
  render(<Anfitrion />);
  await usuario.upload(camara(), [jpg('a.jpg'), jpg('b.jpg')]);
  await screen.findByText('Tipo de archivo no permitido.');

  await usuario.click(screen.getByRole('button', { name: 'Quitar b.jpg' }));
  expect(screen.queryByText('Tipo de archivo no permitido.')).toBeNull();
  expect(llamadas.some((l) => l.metodo === 'DELETE')).toBe(false);

  await usuario.click(screen.getByRole('button', { name: 'Quitar foto-1.jpg' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: /^Quitar/ })).toBeNull());
  expect(llamadas.filter((l) => l.metodo === 'DELETE').map((l) => l.ruta)).toEqual([
    '/api/archivos/1',
  ]);
});

it('revoca las vistas previas al quitar y al desmontar', async () => {
  const usuario = userEvent.setup();
  simularArchivos();
  const { unmount } = render(<Anfitrion />);
  await usuario.upload(camara(), [jpg('a.jpg'), jpg('b.jpg')]);
  await waitFor(() => expect(screen.getAllByRole('button', { name: /^Quitar/ })).toHaveLength(2));

  await usuario.click(screen.getAllByRole('button', { name: /^Quitar/ })[0]!);
  await waitFor(() => expect(revocar).toHaveBeenCalledTimes(1));
  unmount();
  expect(revocar).toHaveBeenCalledTimes(2);
});

it('una imagen que el navegador no decodifica (HEIC) se muestra como documento', async () => {
  const usuario = userEvent.setup();
  simularArchivos();
  const { container } = render(<Anfitrion />);
  await usuario.upload(camara(), jpg('a.jpg'));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Quitar/ })).toBeTruthy());
  const img = container.querySelector('img[src^="blob:"]')!;
  img.dispatchEvent(new Event('error'));
  await waitFor(() => expect(container.querySelector('img')).toBeNull());
  expect(screen.getByText('foto-1.jpg')).toBeTruthy();
  // El blob de la vista previa que no se pudo mostrar se libera de inmediato.
  expect(revocar).toHaveBeenCalledWith('blob:prueba-1');
});

it('abrirCamaraAlMontar hace clic una vez en el input de cámara', () => {
  const clic = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
  render(<Anfitrion abrirCamaraAlMontar />);
  expect(clic).toHaveBeenCalledTimes(1);
  expect(clic.mock.contexts[0]).toBe(camara());
});

it('no comprime los HEIC', async () => {
  const usuario = userEvent.setup();
  simularArchivos();
  render(<Anfitrion />);
  await usuario.upload(camara(), archivoDePrueba('a.heic', 'image/heic'));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Quitar/ })).toBeTruthy());
  expect(comprimir).not.toHaveBeenCalled();
  await usuario.upload(camara(), jpg('b.jpg'));
  await waitFor(() => expect(comprimir).toHaveBeenCalledTimes(1));
});
