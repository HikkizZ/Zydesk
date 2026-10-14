import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { FranjaPlazo, textoPlazo, type DatosPlazo } from '@/components/dominio/FranjaPlazo';

// 2026-10-07T15:00Z = mié 7 oct 12:00 en Santiago.
const LIMITE = '2026-10-07T15:00:00.000Z';

function plazo(cambios: Partial<DatosPlazo> = {}): DatosPlazo {
  return {
    fecha_limite: LIMITE,
    cerrado_en: null,
    vencido: false,
    vence_hoy: false,
    plazo_habil: { total: 16, restantes: 6, calculado_en: '2026-10-06T12:00:00.000Z' },
    ...cambios,
  };
}

const habil = (total: number, restantes: number) => ({
  total,
  restantes,
  calculado_en: '2026-10-06T12:00:00.000Z',
});

it.each<[string, Partial<DatosPlazo>, string]>([
  ['sin fecha', { fecha_limite: null, plazo_habil: null }, 'Sin plazo'],
  ['holgura en horas', {}, 'Quedan 6 h hábiles'],
  ['horas con decimal', { plazo_habil: habil(16, 2.5) }, 'Quedan 2,5 h hábiles'],
  ['desde 24 h, en días hábiles', { plazo_habil: habil(48, 26) }, 'Quedan 3,3 días hábiles'],
  ['vence hoy', { vence_hoy: true }, 'Vence hoy 12:00'],
  ['vencido en horas', { vencido: true, plazo_habil: habil(16, -2) }, 'Vencido hace 2 h hábiles'],
  [
    'vencido en días',
    { vencido: true, plazo_habil: habil(16, -26.4) },
    'Vencido hace 3,3 días hábiles',
  ],
  ['sin plazo hábil, con fecha', { plazo_habil: null }, 'Vence 7 oct'],
  ['sin plazo hábil, vence hoy', { plazo_habil: null, vence_hoy: true }, 'Vence hoy 12:00'],
  ['sin plazo hábil, vencido', { plazo_habil: null, vencido: true }, 'Vencido · 7 oct'],
  [
    'resuelto en plazo',
    { cerrado_en: '2026-10-06T13:00:00.000Z', plazo_habil: habil(16, 3) },
    'Resuelto en plazo',
  ],
  [
    'resuelto fuera de plazo',
    { cerrado_en: '2026-10-08T13:00:00.000Z', plazo_habil: habil(16, -3) },
    'Resuelto fuera de plazo',
  ],
  [
    'resuelto sin plazo hábil',
    { cerrado_en: '2026-10-06T13:00:00.000Z', plazo_habil: null },
    'Resuelto',
  ],
])('textoPlazo: %s', (_caso, cambios, esperado) => {
  expect(textoPlazo(plazo(cambios))).toBe(esperado);
});

it('muestra el texto con el título de la fecha límite y la línea al 38 %', () => {
  const { container } = render(<FranjaPlazo ticket={plazo({ plazo_habil: habil(16, 6) })} />);
  expect(screen.getByText('Quedan 6 h hábiles').getAttribute('title')).toContain('12:00');
  const raiz = container.firstElementChild as HTMLElement;
  expect(raiz.dataset['tono']).toBe('ok');
  const barra = container.querySelector('[data-franja="barra"]') as HTMLElement;
  expect(barra.getAttribute('aria-hidden')).toBe('true');
  expect(barra.className).toContain('max-w-[120px]');
  expect(barra.className).toContain('h-[3px]');
  expect((barra.firstElementChild as HTMLElement).style.width).toBe('38%');
  expect((barra.firstElementChild as HTMLElement).className).toContain('bg-plazo-ok');
});

it('bajo el 25 % queda en ámbar y vencido en rojo con la línea llena', () => {
  const atento = render(<FranjaPlazo ticket={plazo({ plazo_habil: habil(16, 3) })} />);
  expect((atento.container.firstElementChild as HTMLElement).dataset['tono']).toBe('atento');
  expect(screen.getByText('Quedan 3 h hábiles').className).toContain('text-plazo-atento');
  atento.unmount();

  const vencido = render(
    <FranjaPlazo ticket={plazo({ vencido: true, plazo_habil: habil(16, -2) })} />,
  );
  const barra = vencido.container.querySelector('[data-franja="barra"]') as HTMLElement;
  expect((barra.firstElementChild as HTMLElement).style.width).toBe('100%');
  expect((barra.firstElementChild as HTMLElement).className).toContain('bg-plazo-vencido');
  const texto = screen.getByText('Vencido hace 2 h hábiles');
  expect(texto.className).toContain('text-plazo-vencido');
  expect(texto.className).toContain('font-medium');
});

it('resuelto: línea llena y gris, texto en tinta-2', () => {
  const { container } = render(
    <FranjaPlazo ticket={plazo({ cerrado_en: '2026-10-06T13:00:00.000Z' })} />,
  );
  const barra = container.querySelector('[data-franja="barra"]') as HTMLElement;
  expect((barra.firstElementChild as HTMLElement).className).toContain('bg-tinta-4');
  expect((barra.firstElementChild as HTMLElement).style.width).toBe('100%');
  expect(screen.getByText('Resuelto en plazo').className).toContain('text-tinta-2');
});

it('sin plazo_habil solo hay texto, sin línea', () => {
  const { container } = render(<FranjaPlazo ticket={plazo({ plazo_habil: null })} />);
  expect(screen.getByText('Vence 7 oct')).toBeTruthy();
  expect(container.querySelector('[data-franja="barra"]')).toBeNull();
});

it('sin fecha límite no hay línea ni título', () => {
  const { container } = render(
    <FranjaPlazo ticket={plazo({ fecha_limite: null, plazo_habil: null })} />,
  );
  expect(screen.getByText('Sin plazo').hasAttribute('title')).toBe(false);
  expect(container.querySelector('[data-franja="barra"]')).toBeNull();
});

it('variante ancha: texto completo, línea hasta 500 px y nota del horario hábil', () => {
  const { container } = render(<FranjaPlazo variante="ancha" ticket={plazo()} />);
  expect(
    screen.getByText('Resolución: vence mié 7 oct 12:00 · quedan 6 h hábiles de 16'),
  ).toBeTruthy();
  const barra = container.querySelector('[data-franja="barra"]') as HTMLElement;
  expect(barra.className).toContain('max-w-[500px]');
  expect(
    screen.getByText('Horario hábil del departamento · colación y feriados excluidos'),
  ).toBeTruthy();
});

it('variante ancha sin plazo_habil: solo la fecha y sin segunda línea', () => {
  render(<FranjaPlazo variante="ancha" ticket={plazo({ plazo_habil: null })} />);
  expect(screen.getByText('Resolución: vence mié 7 oct 12:00')).toBeTruthy();
  expect(screen.queryByText(/Horario hábil/)).toBeNull();
});

it('variante ancha en días hábiles expresa el total en la misma unidad', () => {
  render(<FranjaPlazo variante="ancha" ticket={plazo({ plazo_habil: habil(48, 26) })} />);
  expect(
    screen.getByText('Resolución: vence mié 7 oct 12:00 · quedan 3,3 días hábiles de 6'),
  ).toBeTruthy();
});
