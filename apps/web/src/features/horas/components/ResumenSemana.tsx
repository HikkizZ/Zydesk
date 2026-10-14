import { LineaIndicadores } from '@/components/dominio/LineaIndicadores';
import { Progress } from '@/components/ui/progress';
import { formatearHoras } from '@/lib/formato';
import type { PlanillaDatos } from '../api';

// Resumen semanal: total contra la jornada de la semana y el corte facturables / internas / fuera de horario.
export function ResumenSemana({ totales }: { totales: PlanillaDatos['totales'] }) {
  const jornada = totales.jornada_semanal;
  const avance =
    jornada === null || jornada === 0 ? 0 : Math.min(100, (totales.semana / jornada) * 100);
  return (
    <section aria-label="Resumen semanal" className="flex flex-col gap-2">
      <LineaIndicadores
        items={[
          {
            etiqueta: 'Total de la semana',
            valor: (
              <>
                <span data-testid="total-semana">{formatearHoras(totales.semana)}</span>
                {jornada === null ? null : (
                  <span className="font-normal text-tinta-3">
                    {' '}
                    de <span data-testid="jornada-semana">{formatearHoras(jornada)}</span>
                  </span>
                )}
              </>
            ),
          },
          { etiqueta: 'Facturables', tono: 'acento', valor: formatearHoras(totales.facturables) },
          { etiqueta: 'Internas', tono: 'atento', valor: formatearHoras(totales.internas) },
          { etiqueta: 'Fuera de horario', valor: formatearHoras(totales.fuera_de_horario) },
        ]}
      />
      {jornada === null ? (
        <p className="text-xs text-tinta-3">Sin jornada para comparar</p>
      ) : (
        <Progress
          value={avance}
          aria-label="Avance de la semana"
          className="max-w-xs bg-panel-hundido [&>*]:bg-acento"
        />
      )}
      <p className="text-xs text-tinta-3">Las horas de OT facturables son las que se cobran</p>
    </section>
  );
}
