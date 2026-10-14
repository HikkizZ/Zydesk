import { LineaIndicadores } from '@/components/dominio/LineaIndicadores';
import type { ReporteSalidaDatos } from '../api';
import { numeroDias, numeroHoras, pluralizar, porcentaje } from '../formato';

type Indicadores = ReporteSalidaDatos['indicadores'];

// Cuatro indicadores de la pantalla 14 (LineaIndicadores) con `aria-label` completo (spec fase 7 §8.4 punto 2).
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

  const detalle = (texto: string) => (
    <span className="ml-1.5 font-normal text-tinta-3">{texto}</span>
  );

  return (
    <LineaIndicadores
      items={[
        {
          etiqueta: 'Tickets cerrados',
          valor: (
            <>
              {cerrados.total}
              {detalle(detalleCerrados)}
            </>
          ),
          ariaLabel: `Tickets cerrados: ${cerrados.total}, ${detalleCerrados}`,
        },
        {
          etiqueta: 'Resolución promedio',
          valor: (
            <>
              {textoResolucion}
              {sinCalendario ? detalle(sinCalendario) : null}
            </>
          ),
          ariaLabel: etiquetaResolucion,
        },
        {
          etiqueta: 'Dentro de plazo',
          tono: 'ok',
          valor: (
            <>
              {textoPlazo}
              {plazo.pct !== null ? detalle(detallePlazo) : null}
            </>
          ),
          ariaLabel: `Dentro de plazo: ${plazo.pct === null ? 'sin datos' : `${textoPlazo}, ${detallePlazo}`}`,
        },
        {
          etiqueta: 'Horas facturables',
          tono: 'acento',
          valor: (
            <>
              {textoHoras}
              {horas.pct_facturables !== null ? detalle(detalleHoras) : null}
            </>
          ),
          ariaLabel: `Horas facturables: ${horas.pct_facturables === null ? 'sin datos' : `${textoHoras}, ${detalleHoras}`}`,
        },
      ]}
    />
  );
}
