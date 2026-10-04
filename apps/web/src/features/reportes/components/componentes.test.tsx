import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { TarjetaIndicador } from '@/components/dominio/TarjetaIndicador';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { reporteDePrueba } from '@/test/reportes';
import { sumarDias } from '../filtros';
import { GraficoCarga } from './GraficoCarga';
import { GraficoHorasSemana } from './GraficoHorasSemana';
import { GraficoPrioridad } from './GraficoPrioridad';
import { IndicadoresReportes } from './IndicadoresReportes';
import { TablaPorCliente } from './TablaPorCliente';

const montar = (ui: React.ReactElement) =>
  render(<ConSesion yo={yoDePrueba({ rol: 'lectura' })}>{ui}</ConSesion>);

const filasDe = (tabla: HTMLElement) =>
  within(tabla)
    .getAllByRole('row')
    .slice(1)
    .map((f) => Array.from(f.children).map((c) => c.textContent));

it('TarjetaIndicador es un enlace con `to` y un grupo sin él', () => {
  montar(
    <>
      <TarjetaIndicador etiqueta="Con enlace" to="/ots" tono="text-tinta">
        1
      </TarjetaIndicador>
      <TarjetaIndicador etiqueta="Sin enlace" tono="text-tinta" ariaLabel="Sin enlace: 2">
        2
      </TarjetaIndicador>
    </>,
  );
  expect(screen.getByRole('link', { name: /Con enlace/ }).getAttribute('href')).toBe('/ots');
  expect(screen.getByRole('group', { name: 'Sin enlace: 2' })).toBeTruthy();
});

it('los indicadores muestran las cifras del escenario de la spec', () => {
  montar(<IndicadoresReportes indicadores={reporteDePrueba().indicadores} />);
  expect(screen.getByText('4 resueltos · 1 descartado · 1 duplicado')).toBeTruthy();
  const cerrados = screen.getByRole('group', { name: /^Tickets cerrados: 6/ });
  expect(cerrados.textContent).toContain('6');
  expect(screen.getByText('1,5 días hábiles')).toBeTruthy();
  expect(screen.getByText('75 %')).toBeTruthy();
  expect(screen.getByText('3 de 4 resueltos con plazo')).toBeTruthy();
  expect(screen.getByText('50 %')).toBeTruthy();
  expect(screen.getByText('5 de 10 h')).toBeTruthy();
  expect(screen.queryByText(/sin calendario/)).toBeNull();
});

it('sin datos los indicadores muestran «—» y avisan los tickets sin calendario', () => {
  const base = reporteDePrueba().indicadores;
  montar(
    <IndicadoresReportes
      indicadores={{
        cerrados: { total: 1, resueltos: 1, descartados: 0, duplicados: 0 },
        resolucion: { promedio_dias: null, n: 0, sin_calendario: 2 },
        dentro_de_plazo: { pct: null, dentro: 0, n: 0 },
        horas: { ...base.horas, total: 0, facturables: 0, internas: 0, pct_facturables: null },
      }}
    />,
  );
  expect(screen.getAllByText('—')).toHaveLength(3);
  expect(screen.getByText('2 sin calendario')).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Horas facturables: sin datos' })).toBeTruthy();
  expect(screen.getByText('1 resuelto · 0 descartados · 0 duplicados')).toBeTruthy();
});

it('el gráfico de horas por semana tiene la tabla oculta y el resumen', () => {
  montar(
    <GraficoHorasSemana semanas={reporteDePrueba().horas_por_semana} ancho={600} alto={260} />,
  );
  const tabla = screen.getByRole('table', { name: /Horas por semana/ });
  expect(filasDe(tabla)).toEqual([['2026-09-28', '5', '5', '10']]);
  expect(screen.getByText('5 de 10 h facturables (50 %)')).toBeTruthy();
  expect(screen.getByText('Facturables vs. internas')).toBeTruthy();
});

it('sin horas el gráfico muestra el estado vacío', () => {
  montar(<GraficoHorasSemana semanas={[{ semana: '2026-09-28', facturables: 0, internas: 0 }]} />);
  expect(screen.getByText('Sin horas en el período')).toBeTruthy();
});

it('con maxSemanas recorta a las últimas semanas y lo avisa', () => {
  const semanas = Array.from({ length: 10 }, (_, i) => ({
    semana: sumarDias('2026-07-27', i * 7),
    facturables: 1,
    internas: 1,
  }));
  montar(<GraficoHorasSemana semanas={semanas} maxSemanas={8} ancho={600} />);
  expect(screen.getByText('Mostrando las últimas 8 semanas; exporta para ver todas')).toBeTruthy();
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(9);
});

it('la carga muestra «2 · 10/32,8 h» y la barra accesible de la primera persona', () => {
  montar(<GraficoCarga carga={reporteDePrueba().carga} />);
  expect(screen.getByText(/^2 · 10\/32,8 h/)).toBeTruthy();
  const barra = screen.getByRole('img', { name: /^Camila Rojas:/ });
  expect(barra.getAttribute('aria-label')).toBe(
    'Camila Rojas: 2 tickets abiertos, 10 h estimadas de 32,8 h disponibles',
  );
  expect((barra as HTMLElement).style.width).toBe('30%');
});

it('con pct 120 la barra se recorta al 100 % y el número queda en urgente', () => {
  const [primera] = reporteDePrueba().carga;
  montar(<GraficoCarga carga={[{ ...primera!, horas_estimadas: 39.4, pct: 120 }]} />);
  expect((screen.getByRole('img') as HTMLElement).style.width).toBe('100%');
  const numero = screen.getByText('120 %');
  expect(numero.className).toContain('text-urgente');
  expect(numero.className).toContain('font-semibold');
});

it('sin capacidad la carga muestra «Sin jornada» y no dibuja barra', () => {
  const [primera] = reporteDePrueba().carga;
  montar(
    <GraficoCarga
      carga={[{ ...primera!, departamento: null, capacidad_semanal: null, pct: null }]}
    />,
  );
  expect(screen.getByText('Sin jornada')).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
  const tabla = screen.getByRole('table', { name: 'Carga vs capacidad' });
  expect(filasDe(tabla)).toEqual([['Camila Rojas', '—', '2', '10', '—', '—']]);
});

it('la resolución marca «sobre plazo» solo en Alta', () => {
  montar(<GraficoPrioridad resolucion={reporteDePrueba().resolucion_por_prioridad} />);
  const marcas = screen.getAllByText(/· sobre plazo/);
  expect(marcas).toHaveLength(1);
  expect(marcas[0]!.closest('li')?.textContent).toContain('Alta');
  expect(marcas[0]!.className).toContain('text-urgente');
  expect(screen.getByText(/^1 d · obj\. 1/)).toBeTruthy();
  const tabla = screen.getByRole('table', { name: 'Resolución por prioridad' });
  expect(filasDe(tabla)[1]).toEqual(['Alta', '1', '2', '1', 'Sí']);
});

it('una prioridad sin tickets resueltos dice «Sin tickets resueltos»', () => {
  const resolucion = reporteDePrueba().resolucion_por_prioridad.map((r) =>
    r.prioridad === 'baja'
      ? { ...r, n: 0, promedio_dias: null, objetivo_dias: null, sobre_plazo: false }
      : r,
  );
  montar(<GraficoPrioridad resolucion={resolucion} />);
  expect(screen.getByText('Sin tickets resueltos')).toBeTruthy();
});

it('la tabla por cliente muestra montos, «—» en Interno y totales', () => {
  montar(<TablaPorCliente filas={reporteDePrueba().por_cliente} />);
  const clinica = screen.getByRole('link', { name: 'Clínica Los Robles' });
  expect(clinica.getAttribute('href')).toBe('/clientes/21');
  const filaClinica = clinica.closest('tr')!;
  expect(within(filaClinica).getByText('$250.000')).toBeTruthy();
  const interno = screen.getByText('Interno');
  expect(interno.className).toContain('italic');
  expect(screen.queryByRole('link', { name: 'Interno' })).toBeNull();
  expect(within(interno.closest('tr')!).getAllByText('—')).toHaveLength(2);
  const vina = within(screen.getByRole('link', { name: 'Viña' }).closest('tr')!);
  expect(vina.getByText('$680.000').className).toContain('text-alta');
  const pie = within(screen.getAllByRole('row').at(-1)!);
  expect(pie.getByText('Total')).toBeTruthy();
  expect(pie.getByText('9 h')).toBeTruthy();
  expect(pie.getByText('$250.000')).toBeTruthy();
  expect(pie.getByText('$680.000')).toBeTruthy();
});

it('sin filas la tabla por cliente muestra el estado vacío', () => {
  montar(<TablaPorCliente filas={[]} />);
  expect(screen.getByText('Nada que mostrar con estos filtros')).toBeTruthy();
});
