import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { ArchivoDatos } from '@/features/tickets/api';
import { GaleriaArchivos } from './GaleriaArchivos';

const foto: ArchivoDatos = {
  id: 1,
  nombre_original: 'tablero.heic',
  tipo_mime: 'image/heic',
  categoria: 'foto',
  subido_por: null,
  subido_en: '2026-09-28T19:58:00.000Z',
  origen_correo: false,
  tamano: 204800,
  es_imagen: true,
  url: '/api/archivos/1',
};

it('si la imagen no se puede decodificar, el ítem pasa a modo documento con su nombre', () => {
  render(<GaleriaArchivos archivos={[{ archivo: foto }]} />);
  fireEvent.error(screen.getByRole('img', { name: 'tablero.heic' }));
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('tablero.heic')).toBeTruthy();
});
