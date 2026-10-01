import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Monto } from './Monto';
import { PillEstadoCotizacion } from './PillEstadoCotizacion';

it('Monto formatea CLP por defecto y UF con dos decimales', () => {
  render(
    <>
      <Monto valor={565250} />
      <Monto valor={12.5} moneda="UF" />
      <Monto valor={-9000} />
    </>,
  );
  expect(screen.getByText('$565.250')).toBeTruthy();
  expect(screen.getByText('UF 12,50')).toBeTruthy();
  expect(screen.getByText('-$9.000')).toBeTruthy();
});

it('Monto usa fuente monoespaciada, cifras tabulares y alineación a la derecha', () => {
  render(<Monto valor={1000} className="text-lg" />);
  const el = screen.getByText('$1.000');
  expect(el.className).toContain('font-mono');
  expect(el.className).toContain('tabular-nums');
  expect(el.className).toContain('text-right');
  expect(el.className).toContain('text-lg');
});

it('PillEstadoCotizacion muestra siempre el texto; "Reemplazada" va tachada', () => {
  render(
    <>
      <PillEstadoCotizacion estado="borrador" />
      <PillEstadoCotizacion estado="enviada" />
      <PillEstadoCotizacion estado="aprobada" />
      <PillEstadoCotizacion estado="rechazada" />
      <PillEstadoCotizacion estado="reemplazada" />
    </>,
  );
  for (const t of ['Borrador', 'Enviada', 'Aprobada', 'Rechazada']) {
    expect(screen.getByText(t)).toBeTruthy();
  }
  expect(screen.getByText('Reemplazada').className).toContain('line-through');
});
