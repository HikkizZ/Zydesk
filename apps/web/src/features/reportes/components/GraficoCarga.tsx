import { Avatar } from '@/components/dominio/Avatar';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { cn } from '@/lib/utils';
import type { CargaPersonaDatos } from '../api';
import { numeroHoras, pluralizar } from '../formato';

function Fila({ c }: { c: CargaPersonaDatos }) {
  const conCapacidad = c.capacidad_semanal !== null && c.capacidad_semanal > 0;
  const pct = c.pct ?? 0;
  const etiqueta = `${c.tickets_abiertos} · ${numeroHoras(c.horas_estimadas)}/${
    c.capacidad_semanal === null ? '—' : numeroHoras(c.capacidad_semanal)
  } h`;
  return (
    <li className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
      <span className="flex min-w-0 items-center gap-2">
        <Avatar iniciales={c.usuario.iniciales} color={c.usuario.color_avatar} className="size-7" />
        <span className="truncate text-sm font-medium">{c.usuario.nombre}</span>
      </span>
      {conCapacidad ? (
        <span className="h-2.5 overflow-hidden rounded-full bg-superficie-suave-2">
          <span
            role="img"
            aria-label={`${c.usuario.nombre}: ${pluralizar(c.tickets_abiertos, 'ticket abierto', 'tickets abiertos')}, ${numeroHoras(c.horas_estimadas)} h estimadas de ${numeroHoras(c.capacidad_semanal ?? 0)} h disponibles`}
            className="block h-full rounded-full bg-grafico-facturable"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </span>
      ) : (
        <span className="text-sm text-tinta-3">Sin jornada</span>
      )}
      <span className="col-span-2 text-sm tabular-nums text-tinta-2 sm:col-span-1 sm:text-right">
        {etiqueta}
        {conCapacidad ? (
          <span className={cn('ml-2', pct > 100 && 'font-semibold text-urgente')}>{pct} %</span>
        ) : null}
      </span>
    </li>
  );
}

// Carga por persona vs capacidad, en HTML: instantánea de hoy (spec fase 7 §4.10).
export function GraficoCarga({ carga }: { carga: CargaPersonaDatos[] }) {
  return (
    <figure className="space-y-3 rounded-lg border border-borde bg-superficie p-4">
      <figcaption className="font-titulo text-lg font-semibold">
        Carga por persona vs capacidad
        <span className="block text-sm font-normal text-tinta-2">
          Hoy · tickets abiertos · horas estimadas / horas disponibles a la semana
        </span>
      </figcaption>
      {carga.length === 0 ? (
        <EstadoVacio titulo="Sin personas con estos filtros" />
      ) : (
        <ul className="space-y-3">
          {carga.map((c) => (
            <Fila key={c.usuario.id} c={c} />
          ))}
        </ul>
      )}
      <table className="sr-only">
        <caption>Carga vs capacidad</caption>
        <thead>
          <tr>
            <th scope="col">Persona</th>
            <th scope="col">Departamento</th>
            <th scope="col">Tickets abiertos</th>
            <th scope="col">Horas estimadas</th>
            <th scope="col">Capacidad semanal</th>
            <th scope="col">% de la capacidad</th>
          </tr>
        </thead>
        <tbody>
          {carga.map((c) => (
            <tr key={c.usuario.id}>
              <th scope="row">{c.usuario.nombre}</th>
              <td>{c.departamento?.nombre ?? '—'}</td>
              <td>{c.tickets_abiertos}</td>
              <td>{numeroHoras(c.horas_estimadas)}</td>
              <td>{c.capacidad_semanal === null ? '—' : numeroHoras(c.capacidad_semanal)}</td>
              <td>{c.pct === null ? '—' : c.pct}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
