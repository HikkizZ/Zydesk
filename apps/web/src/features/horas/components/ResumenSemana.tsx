import { Progress } from '@/components/ui/progress';
import { formatearHoras } from '@/lib/formato';
import type { PlanillaDatos } from '../api';

// Resumen semanal: total contra la jornada de la semana y el corte facturables / internas / fuera de horario.
export function ResumenSemana({ totales }: { totales: PlanillaDatos['totales'] }) {
  const jornada = totales.jornada_semanal;
  const avance =
    jornada === null || jornada === 0 ? 0 : Math.min(100, (totales.semana / jornada) * 100);
  return (
    <section
      aria-label="Resumen semanal"
      className="space-y-4 rounded-lg border border-borde bg-superficie p-4"
    >
      <div>
        <p className="text-sm text-tinta-2">Total de la semana</p>
        <p className="font-mono text-2xl font-semibold">
          <span data-testid="total-semana">{formatearHoras(totales.semana)}</span>
          {jornada === null ? null : (
            <span className="text-base font-normal text-tinta-3">
              {' '}
              de <span data-testid="jornada-semana">{formatearHoras(jornada)}</span>
            </span>
          )}
        </p>
        {jornada === null ? (
          <p className="mt-1 text-xs text-tinta-3">Sin jornada para comparar</p>
        ) : (
          <Progress
            value={avance}
            aria-label="Avance de la semana"
            className="mt-2 bg-superficie-suave-2 [&>*]:bg-acento"
          />
        )}
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <Cifra titulo="Facturables" valor={totales.facturables} clase="text-acento" />
        <Cifra titulo="Internas" valor={totales.internas} clase="text-alta" />
        <Cifra titulo="Fuera de horario" valor={totales.fuera_de_horario} clase="text-tinta" />
      </dl>
      <p className="text-xs text-tinta-3">Las horas de OT facturables son las que se cobran</p>
    </section>
  );
}

function Cifra({ titulo, valor, clase }: { titulo: string; valor: number; clase: string }) {
  return (
    <div>
      <dt className="text-xs text-tinta-2">{titulo}</dt>
      <dd className={`font-mono text-lg font-semibold ${clase}`}>{formatearHoras(valor)}</dd>
    </div>
  );
}
