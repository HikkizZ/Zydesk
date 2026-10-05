import { TarjetaIndicador } from '@/components/dominio/TarjetaIndicador';
import type { ReporteSalidaDatos } from '../api';
import { numeroDias, numeroHoras, pluralizar, porcentaje } from '../formato';

type Indicadores = ReporteSalidaDatos['indicadores'];

// Cuatro tarjetas de la pantalla 14 con `aria-label` completo (spec fase 7 §8.4 punto 2).
export function IndicadoresReportes({ indicadores }: { indicadores: Indicadores }) {
  const { cerrados, resolucion, dentro_de_plazo: plazo, horas } = indicadores;

  const detalleCerrados = [
    pluralizar(cerrados.resueltos, 'resuelto', 'resueltos'),
    pluralizar(cerrados.descartados, 'descartado', 'descartados'),
    pluralizar(cerrados.duplicados, 'duplicado', 'duplicados'),
  ].join(' · ');

  const sinCalendario =
    resolucion.sin_calendario > 0 ? `${resolucion.sin_calendario} sin calendario` : null;
  const textoResolucion =
    resolucion.promedio_dias === null
      ? '—'
      : `${numeroDias(resolucion.promedio_dias)} ${resolucion.promedio_dias === 1 ? 'día hábil' : 'días hábiles'}`;
  const textoPlazo = plazo.pct === null ? '—' : porcentaje(plazo.pct);
  const detallePlazo = `${plazo.dentro} de ${pluralizar(plazo.n, 'resuelto', 'resueltos')} con plazo`;
  const textoHoras = horas.pct_facturables === null ? '—' : porcentaje(horas.pct_facturables);
  const detalleHoras = `${numeroHoras(horas.facturables)} de ${numeroHoras(horas.total)} h`;

  const etiquetaResolucion = [
    `Resolución promedio: ${resolucion.promedio_dias === null ? 'sin datos' : textoResolucion}`,
    sinCalendario,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div role="group" aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <TarjetaIndicador
        etiqueta="Tickets cerrados"
        tono="text-tinta"
        ariaLabel={`Tickets cerrados: ${cerrados.total}, ${detalleCerrados}`}
      >
        {cerrados.total}
        <span className="block text-sm font-normal text-tinta-2">{detalleCerrados}</span>
      </TarjetaIndicador>
      <TarjetaIndicador
        etiqueta="Resolución promedio"
        tono="text-tinta"
        ariaLabel={etiquetaResolucion}
      >
        {textoResolucion}
        {sinCalendario ? (
          <span className="block text-sm font-normal text-tinta-3">{sinCalendario}</span>
        ) : null}
      </TarjetaIndicador>
      <TarjetaIndicador
        etiqueta="Dentro de plazo"
        tono="text-resuelto"
        ariaLabel={`Dentro de plazo: ${plazo.pct === null ? 'sin datos' : `${textoPlazo}, ${detallePlazo}`}`}
      >
        {textoPlazo}
        {plazo.pct !== null ? (
          <span className="block text-sm font-normal text-tinta-2">{detallePlazo}</span>
        ) : null}
      </TarjetaIndicador>
      <TarjetaIndicador
        etiqueta="Horas facturables"
        tono="text-acento"
        ariaLabel={`Horas facturables: ${horas.pct_facturables === null ? 'sin datos' : `${textoHoras}, ${detalleHoras}`}`}
      >
        {textoHoras}
        {horas.pct_facturables !== null ? (
          <span className="block text-sm font-normal text-tinta-2">{detalleHoras}</span>
        ) : null}
      </TarjetaIndicador>
    </div>
  );
}
