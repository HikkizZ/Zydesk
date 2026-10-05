import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Etapas } from './Etapas';

it('facturable en cotizada marca el paso 2 como actual y muestra "Facturada" al final', () => {
  render(
    <Etapas ot={{ tipo: 'facturable', etapa: 'cotizada', estado_facturacion: 'pendiente' }} />,
  );
  const pasos = screen.getAllByRole('listitem');
  expect(pasos.map((p) => p.textContent?.replace(/^\d+/, '').replace(' (hecho)', ''))).toEqual([
    'Borrador',
    'Cotizada',
    'Aprobada',
    'En ejecución',
    'Cerrada',
    'Facturada',
  ]);
  expect(pasos[1]?.getAttribute('aria-current')).toBe('step');
  expect(pasos.filter((p) => p.hasAttribute('aria-current'))).toHaveLength(1);
});

it('cerrada y facturada marca el paso derivado "Facturada"', () => {
  render(<Etapas ot={{ tipo: 'facturable', etapa: 'cerrada', estado_facturacion: 'facturada' }} />);
  const actual = screen.getAllByRole('listitem').find((p) => p.hasAttribute('aria-current'));
  expect(actual?.textContent).toContain('Facturada');
});

it('interna no tiene el paso "Facturada"', () => {
  render(
    <Etapas ot={{ tipo: 'interna', etapa: 'en_ejecucion', estado_facturacion: 'no_aplica' }} />,
  );
  expect(screen.getAllByRole('listitem')).toHaveLength(4);
  expect(screen.queryByText('Facturada')).toBeNull();
});

it('cancelada muestra el aviso con el motivo en lugar del stepper', () => {
  render(
    <Etapas
      ot={{
        tipo: 'facturable',
        etapa: 'cancelada',
        estado_facturacion: 'no_aplica',
        motivo_cancelacion: 'El cliente desistió',
      }}
    />,
  );
  expect(screen.getByRole('status').textContent).toBe('Cancelada · El cliente desistió');
  expect(screen.queryByRole('list')).toBeNull();
});

it('al montar deja el paso actual a la vista, centrado en el stepper', () => {
  const original = Element.prototype.scrollIntoView;
  const espia = vi.fn();
  Element.prototype.scrollIntoView = espia;
  try {
    render(
      <Etapas
        ot={{ tipo: 'facturable', etapa: 'en_ejecucion', estado_facturacion: 'pendiente' }}
      />,
    );
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia).toHaveBeenCalledWith({ inline: 'center', block: 'nearest' });
    expect(espia.mock.contexts[0]).toBe(
      screen.getAllByRole('listitem').find((p) => p.hasAttribute('aria-current')),
    );
  } finally {
    Element.prototype.scrollIntoView = original as typeof original;
  }
});
