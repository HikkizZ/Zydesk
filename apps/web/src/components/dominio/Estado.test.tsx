import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Chip } from '@/components/dominio/Chip';
import { Estado } from '@/components/dominio/Estado';
import { PillEstado } from '@/components/dominio/PillEstado';
import { PillPrioridad } from '@/components/dominio/PillPrioridad';
import { PillTipo } from '@/components/dominio/PillTipo';

it('Estado es punto decorativo de 6 px más texto, sin fondo', () => {
  const { container } = render(<Estado tono="resuelto">Resuelto</Estado>);
  const raiz = container.firstElementChild as HTMLElement;
  expect(raiz.textContent).toBe('Resuelto');
  expect(raiz.className).not.toContain('bg-');
  const punto = raiz.firstElementChild as HTMLElement;
  expect(punto.getAttribute('aria-hidden')).toBe('true');
  expect(punto.className).toContain('size-1.5');
  expect(punto.className).toContain('bg-plazo-ok');
});

it('PillEstado usa el punto del tono y tacha «Descartado»', () => {
  render(<PillEstado estado="descartado" />);
  expect(screen.getByText('Descartado').className).toContain('line-through');
});

it('Chip es un metadato con fondo suave y texto', () => {
  render(<Chip tono="acento">OT-0218</Chip>);
  const chip = screen.getByText('OT-0218');
  expect(chip.className).toContain('bg-acento-suave');
  expect(chip.className).toContain('rounded-sm');
});

it('PillTipo mantiene el texto «OT-0218 · Facturable»', () => {
  render(<PillTipo tipo="ot_facturable" codigo="OT-0218" />);
  expect(screen.getByText('OT-0218 · Facturable')).toBeTruthy();
});

it('PillPrioridad siempre lleva texto, con ícono decorativo', () => {
  const { container } = render(<PillPrioridad prioridad="urgente" />);
  expect(screen.getByText('Urgente').className).toContain('text-plazo-vencido');
  expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
});
