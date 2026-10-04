import { PillPrioridad } from '@/components/dominio/PillPrioridad';
import { ETIQUETA_PRIORIDAD } from '@zydesk/shared';
import type { ResolucionPrioridadDatos } from '../api';
import { numeroDias } from '../formato';

function Fila({ r, escala }: { r: ResolucionPrioridadDatos; escala: number }) {
  const sinDatos = r.n === 0 || r.promedio_dias === null;
  return (
    <li className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[5rem_minmax(0,1fr)_auto]">
      <span>
        <PillPrioridad prioridad={r.prioridad} />
      </span>
      {sinDatos ? (
        <span className="col-span-1 text-sm text-tinta-3 sm:col-span-2">Sin tickets resueltos</span>
      ) : (
        <>
          <span className="relative block h-2.5 rounded-full bg-superficie-suave-2">
            <span
              className="block h-full rounded-full bg-grafico-facturable"
              style={{ width: `${Math.min(100, ((r.promedio_dias ?? 0) / escala) * 100)}%` }}
            />
            {r.objetivo_dias !== null ? (
              <span
                aria-hidden="true"
                className="absolute -top-1 h-4.5 w-0.5 bg-tinta"
                style={{ left: `${Math.min(100, (r.objetivo_dias / escala) * 100)}%` }}
              />
            ) : null}
          </span>
          <span className="col-span-2 text-sm tabular-nums text-tinta-2 sm:col-span-1 sm:text-right">
            {numeroDias(r.promedio_dias ?? 0)} d
            {r.objetivo_dias !== null ? ` · obj. ${numeroDias(r.objetivo_dias)}` : ''}
            {r.sobre_plazo ? (
              <span className="font-semibold text-urgente"> · sobre plazo</span>
            ) : null}
          </span>
        </>
      )}
    </li>
  );
}

// Resolución promedio por prioridad contra el objetivo, en HTML (spec fase 7 §4.6).
export function GraficoPrioridad({ resolucion }: { resolucion: ResolucionPrioridadDatos[] }) {
  const escala = Math.max(
    6,
    ...resolucion.flatMap((r) => [r.promedio_dias ?? 0, r.objetivo_dias ?? 0]),
  );
  return (
    <figure className="space-y-3 rounded-lg border border-borde bg-superficie p-4">
      <figcaption className="font-titulo text-lg font-semibold">
        Resolución por prioridad vs objetivo
        <span className="block text-sm font-normal text-tinta-2">
          Días hábiles de los tickets resueltos en el período; la marca es el objetivo
        </span>
      </figcaption>
      <ul className="space-y-3">
        {resolucion.map((r) => (
          <Fila key={r.prioridad} r={r} escala={escala} />
        ))}
      </ul>
      <table className="sr-only">
        <caption>Resolución por prioridad</caption>
        <thead>
          <tr>
            <th scope="col">Prioridad</th>
            <th scope="col">Tickets</th>
            <th scope="col">Promedio (días hábiles)</th>
            <th scope="col">Objetivo (días hábiles)</th>
            <th scope="col">Sobre plazo</th>
          </tr>
        </thead>
        <tbody>
          {resolucion.map((r) => (
            <tr key={r.prioridad}>
              <th scope="row">{ETIQUETA_PRIORIDAD[r.prioridad]}</th>
              <td>{r.n}</td>
              <td>{r.promedio_dias === null ? '—' : numeroDias(r.promedio_dias)}</td>
              <td>{r.objetivo_dias === null ? '—' : numeroDias(r.objetivo_dias)}</td>
              <td>{r.sobre_plazo ? 'Sí' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
