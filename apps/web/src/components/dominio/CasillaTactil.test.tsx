import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CasillaTactil } from './CasillaTactil';

describe('CasillaTactil', () => {
  it('el label mide 44 px y la casilla visible 20 px', () => {
    render(<CasillaTactil id="c1" checked={false} aria-label="Hecha" onCheckedChange={() => {}} />);
    const casilla = screen.getByRole('checkbox', { name: 'Hecha' });
    const label = casilla.closest('label');
    expect(label?.getAttribute('for')).toBe('c1');
    expect(label?.className).toContain('size-11');
    expect(casilla.className).toContain('size-5');
  });

  it('pulsar el label dispara onCheckedChange', async () => {
    const alCambiar = vi.fn();
    render(
      <CasillaTactil id="c2" checked={false} aria-label="Hecha" onCheckedChange={alCambiar} />,
    );
    const label = screen.getByRole('checkbox').closest('label')!;
    await userEvent.click(label);
    expect(alCambiar).toHaveBeenCalledWith(true);
  });
});
