import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { useState } from 'react';
import { beforeAll, expect, it, vi } from 'vitest';
import { Combo, type OpcionCombo } from '@/components/dominio/Combo';
import { LineaIndicadores } from '@/components/dominio/LineaIndicadores';

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

const OPCIONES: OpcionCombo<number>[] = [
  { valor: 1, etiqueta: 'Carla Rojas', detalle: 'Soporte' },
  { valor: 2, etiqueta: 'Sergio Díaz', detalle: 'Proyectos' },
  { valor: 3, etiqueta: 'Marta Lagos', grupo: 'Externos' },
];

function Simple({ alCambiar }: { alCambiar: (v: number | null) => void }) {
  const [valor, setValor] = useState<number | null>(null);
  return (
    <Combo
      etiqueta="Responsable"
      opciones={OPCIONES}
      valor={valor}
      textoQuitar="Quitar selección"
      alCambiar={(v) => {
        setValor(v);
        alCambiar(v);
      }}
    />
  );
}

it('Combo busca, elige, cierra y deja el nombre accesible con la selección', async () => {
  const usuario = userEvent.setup();
  const alCambiar = vi.fn();
  render(<Simple alCambiar={alCambiar} />);
  await usuario.click(screen.getByRole('combobox', { name: 'Responsable: sin selección' }));
  await usuario.type(screen.getByLabelText('Buscar Responsable'), 'serg');
  expect(screen.queryByRole('option', { name: /Carla Rojas/ })).toBeNull();
  await usuario.click(screen.getByRole('option', { name: /Sergio Díaz/ }));
  expect(alCambiar).toHaveBeenCalledWith(2);
  expect(screen.getByRole('combobox', { name: 'Responsable: Sergio Díaz' })).toBeTruthy();
  expect(screen.queryByLabelText('Buscar Responsable')).toBeNull();
});

it('Combo ofrece «Quitar selección» con un valor elegido', async () => {
  const usuario = userEvent.setup();
  const alCambiar = vi.fn();
  render(<Simple alCambiar={alCambiar} />);
  await usuario.click(screen.getByRole('combobox'));
  await usuario.click(screen.getByRole('option', { name: /Carla Rojas/ }));
  await usuario.click(screen.getByRole('combobox'));
  await usuario.click(screen.getByRole('option', { name: 'Quitar selección' }));
  expect(alCambiar).toHaveBeenLastCalledWith(null);
});

it('Combo muestra «Sin resultados» y agrupa con rótulo', async () => {
  const usuario = userEvent.setup();
  render(<Simple alCambiar={() => {}} />);
  await usuario.click(screen.getByRole('combobox'));
  expect(screen.getByText('Externos')).toBeTruthy();
  await usuario.type(screen.getByLabelText('Buscar Responsable'), 'zzzz');
  expect(screen.getByText('Sin resultados')).toBeTruthy();
});

it('Combo múltiple suma y quita, con chips en el trigger', async () => {
  const usuario = userEvent.setup();
  function Varios() {
    const [valor, setValor] = useState<number[]>([]);
    return (
      <Combo
        multiple
        etiqueta="Seguidores"
        opciones={OPCIONES}
        valor={valor}
        alCambiar={setValor}
      />
    );
  }
  render(<Varios />);
  await usuario.click(screen.getByRole('combobox'));
  await usuario.click(screen.getByRole('option', { name: /Carla Rojas/ }));
  await usuario.click(screen.getByRole('option', { name: /Marta Lagos/ }));
  expect(
    screen.getByRole('combobox', { name: 'Seguidores: Carla Rojas, Marta Lagos' }),
  ).toBeTruthy();
  await usuario.click(screen.getByRole('option', { name: /Carla Rojas/ }));
  expect(screen.getByRole('combobox', { name: 'Seguidores: Marta Lagos' })).toBeTruthy();
});

it('LineaIndicadores agrupa cifras, enlaza y activa los interactivos', async () => {
  const usuario = userEvent.setup();
  const alClick = vi.fn();
  render(
    <MemoryRouter>
      <LineaIndicadores
        items={[
          { etiqueta: 'abiertos', valor: 12, to: '/tickets' },
          { etiqueta: 'vencidos', valor: 3, tono: 'vencido', onClick: alClick },
          { etiqueta: 'horas', valor: '40 h' },
        ]}
      />
    </MemoryRouter>,
  );
  const grupo = screen.getByRole('group', { name: 'Indicadores' });
  expect(grupo.className).toContain('grid-cols-2');
  expect(screen.getByRole('link', { name: /12 abiertos/ }).getAttribute('href')).toBe('/tickets');
  await usuario.click(screen.getByRole('button', { name: /3 vencidos/ }));
  expect(alClick).toHaveBeenCalledOnce();
  expect(screen.getByText('40 h').className).toContain('font-medium');
});
