import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { MigasProvider, useAccionBarra, useMigas } from '../proveedores';
import { BarraSuperior } from './BarraSuperior';

function PaginaConAccion() {
  useAccionBarra(<button type="button">Nuevo ticket</button>);
  return null;
}

function PaginaDeTicket() {
  useMigas({ codigo: 'TK-1048' });
  return null;
}

function montar(ruta: string, pagina?: React.ReactNode) {
  return render(
    <ConSesion yo={yoDePrueba()} ruta={ruta}>
      <MigasProvider>
        <BarraSuperior />
        {pagina}
      </MigasProvider>
    </ConSesion>,
  );
}

it('muestra las migas de /tickets/tabla y marca la última con aria-current', () => {
  montar('/tickets/tabla');
  const migas = screen.getByRole('navigation', { name: 'Migas' });
  expect(within(migas).getByText('Tickets')).toBeTruthy();
  const ultima = within(migas).getByText('Tabla');
  expect(ultima.getAttribute('aria-current')).toBe('page');
  expect(within(migas).getByText('Tickets').getAttribute('aria-current')).toBeNull();
});

it('sin acción registrada la barra solo muestra migas', () => {
  montar('/tickets/tabla');
  expect(screen.queryByRole('button')).toBeNull();
});

it('el slot muestra la acción que registra la página', () => {
  montar('/tickets/tabla', <PaginaConAccion />);
  expect(screen.getByRole('button', { name: 'Nuevo ticket', hidden: true })).toBeTruthy();
});

it('la miga final del detalle toma el código que publica la página', () => {
  montar('/tickets/12', <PaginaDeTicket />);
  const codigo = screen.getByText('TK-1048');
  expect(codigo.getAttribute('aria-current')).toBe('page');
  expect(codigo.className).toContain('font-mono');
  expect(screen.getByRole('link', { name: 'Tickets' }).getAttribute('href')).toBe('/tickets');
});

it('bajo lg se ocultan los niveles anteriores a los dos últimos', () => {
  montar('/configuracion/tarifas');
  const raiz = screen.getByText('Administración').closest('li')!;
  expect(raiz.className).toContain('hidden');
  expect(screen.getByText('Configuración').closest('li')!.className).not.toContain('hidden');
});

it('bajo lg la miga enlazada mide 44 px (min-h-11) y en escritorio no cambia (lg:min-h-0)', () => {
  montar('/tickets/12', <PaginaDeTicket />);
  const enlace = screen.getByRole('link', { name: 'Tickets' });
  expect(enlace.className).toContain('min-h-11');
  expect(enlace.className).toContain('min-w-11');
  expect(enlace.className).toContain('lg:min-h-0');
});
