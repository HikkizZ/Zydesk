import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { diaMesDeFecha } from '@/components/dominio/formato-fecha';
import { horasCorto } from '@/lib/formato';
import type { SemanaHorasDatos } from '../api';
import { sumarDias } from '../filtros';
import { numeroHoras } from '../formato';

const redondear = (n: number) => Math.round(n * 100) / 100;

const rangoSemana = (lunes: string) =>
  `${diaMesDeFecha(lunes)} – ${diaMesDeFecha(sumarDias(lunes, 6))}`;

interface Punto {
  semana: string;
  etiqueta: string;
  facturables: number;
  internas: number;
  total: number;
  base: number;
}

function Detalle({ active, payload }: { active?: boolean; payload?: { payload: Punto }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm shadow-sm">
      {p.etiqueta}: {numeroHoras(p.facturables)} h facturables, {numeroHoras(p.internas)} h internas
    </div>
  );
}

// Barras apiladas facturables / internas por semana. Con `ancho` el gráfico tiene tamaño fijo
// (tests); sin él se adapta al contenedor con `ResponsiveContainer`.
export function GraficoHorasSemana({
  semanas,
  maxSemanas,
  ancho,
  alto = 280,
}: {
  semanas: SemanaHorasDatos[];
  /** Recorta a las últimas N semanas (bajo 1024 px). */
  maxSemanas?: number;
  ancho?: number;
  alto?: number;
}) {
  const recortado = maxSemanas !== undefined && semanas.length > maxSemanas;
  const visibles = recortado ? semanas.slice(-maxSemanas) : semanas;
  const puntos: Punto[] = visibles.map((s) => ({
    semana: s.semana,
    etiqueta: rangoSemana(s.semana),
    facturables: s.facturables,
    internas: s.internas,
    total: redondear(s.facturables + s.internas),
    base: 0,
  }));
  const facturables = redondear(puntos.reduce((a, p) => a + p.facturables, 0));
  const total = redondear(puntos.reduce((a, p) => a + p.total, 0));
  const pct = total === 0 ? 0 : Math.round((facturables / total) * 100);

  const grafico = (
    <BarChart
      {...(ancho === undefined ? {} : { width: ancho, height: alto })}
      data={puntos}
      margin={{ top: 20, right: 8, bottom: 4, left: 0 }}
      accessibilityLayer={false}
    >
      <CartesianGrid vertical={false} stroke="var(--color-borde)" />
      <XAxis dataKey="etiqueta" tick={{ fontSize: 12 }} tickLine={false} />
      <YAxis allowDecimals={false} width={32} tick={{ fontSize: 12 }} tickLine={false} />
      <Tooltip content={<Detalle />} cursor={{ fill: 'var(--color-superficie-suave)' }} />
      <Legend />
      <Bar
        dataKey="facturables"
        name="Facturables"
        stackId="horas"
        fill="var(--color-grafico-facturable)"
        isAnimationActive={false}
      >
        <LabelList
          dataKey="facturables"
          position="center"
          fill="#fff"
          fontSize={12}
          formatter={(v: unknown) => horasCorto(Number(v))}
        />
      </Bar>
      <Bar
        dataKey="internas"
        name="Internas"
        stackId="horas"
        fill="var(--color-grafico-interna)"
        isAnimationActive={false}
      >
        <LabelList
          dataKey="internas"
          position="center"
          fill="#1a1a1a"
          fontSize={12}
          formatter={(v: unknown) => horasCorto(Number(v))}
        />
      </Bar>
      {/* Segmento de alto 0 que solo lleva el total sobre la pila. */}
      <Bar dataKey="base" stackId="horas" legendType="none" isAnimationActive={false}>
        <LabelList
          dataKey="total"
          position="top"
          fontSize={12}
          fontWeight={600}
          formatter={(v: unknown) => horasCorto(Number(v))}
        />
      </Bar>
    </BarChart>
  );

  return (
    <figure className="space-y-3 rounded-lg border border-borde bg-superficie p-4">
      <figcaption className="font-titulo text-lg font-semibold">
        Horas por semana
        <span className="block text-sm font-normal text-tinta-2">Facturables vs. internas</span>
      </figcaption>
      {total === 0 ? (
        <EstadoVacio titulo="Sin horas en el período" />
      ) : (
        <>
          {recortado ? (
            <p role="status" className="text-sm text-tinta-3">
              Mostrando las últimas {maxSemanas} semanas; exporta para ver todas
            </p>
          ) : null}
          <div aria-hidden="true">
            {ancho === undefined ? (
              <ResponsiveContainer width="100%" height={alto}>
                {grafico}
              </ResponsiveContainer>
            ) : (
              grafico
            )}
          </div>
          <p className="text-sm text-tinta-2">
            {numeroHoras(facturables)} de {numeroHoras(total)} h facturables ({pct} %)
          </p>
        </>
      )}
      <table className="sr-only">
        <caption>Horas por semana, facturables e internas</caption>
        <thead>
          <tr>
            <th scope="col">Semana</th>
            <th scope="col">Facturables</th>
            <th scope="col">Internas</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {puntos.map((p) => (
            <tr key={p.semana}>
              <th scope="row">{p.semana}</th>
              <td>{numeroHoras(p.facturables)}</td>
              <td>{numeroHoras(p.internas)}</td>
              <td>{numeroHoras(p.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
