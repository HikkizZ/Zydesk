import { estadoPlazo, type EstadoPlazo } from '@zydesk/shared';
import { diaMes, diaMesHoraCorto, horaCorta } from '@/components/dominio/formato-fecha';
import type { TicketResumenDatos } from '@/features/tickets/api';
import { formatearFechaHora } from '@/lib/fechas';
import { cn } from '@/lib/utils';

export type DatosPlazo = Pick<
  TicketResumenDatos,
  'fecha_limite' | 'cerrado_en' | 'vencido' | 'vence_hoy' | 'plazo_habil'
>;

const HORAS_POR_DIA = 8;
const formatoUnDecimal = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });

// «6 h hábiles»; desde 24 h se pasa a días hábiles dividiendo por 8 («3,3 días hábiles»).
function cantidadHabil(horas: number): string {
  const abs = Math.abs(horas);
  return abs >= 24
    ? `${formatoUnDecimal.format(abs / HORAS_POR_DIA)} días hábiles`
    : `${formatoUnDecimal.format(abs)} h hábiles`;
}

function textoResuelto(e: EstadoPlazo): string {
  if (e.en_plazo === null) return 'Resuelto';
  return e.en_plazo ? 'Resuelto en plazo' : 'Resuelto fuera de plazo';
}

/** Texto de la franja en su variante de lista (§5.5 de la spec de la fase 10). */
export function textoPlazo(t: DatosPlazo): string {
  if (t.fecha_limite === null) return 'Sin plazo';
  const e = estadoPlazo(t);
  if (e.resuelto) return textoResuelto(e);
  const p = t.plazo_habil;
  if (e.tono === 'vencido') {
    return p ? `Vencido hace ${cantidadHabil(p.restantes)}` : `Vencido · ${diaMes(t.fecha_limite)}`;
  }
  if (t.vence_hoy) return `Vence hoy ${horaCorta(t.fecha_limite)}`;
  return p ? `Quedan ${cantidadHabil(p.restantes)}` : `Vence ${diaMes(t.fecha_limite)}`;
}

// Variante ancha: «Resolución: vence mié 9 oct 12:00 · quedan 6 h hábiles de 16».
function textoPlazoAncho(t: DatosPlazo): string {
  if (t.fecha_limite === null) return 'Sin plazo';
  const e = estadoPlazo(t);
  const p = t.plazo_habil;
  const verbo = e.resuelto ? 'vencía' : e.tono === 'vencido' ? 'venció' : 'vence';
  const base = `Resolución: ${verbo} ${diaMesHoraCorto(t.fecha_limite)}`;
  if (e.resuelto) return `${base} · ${textoResuelto(e).toLowerCase()}`;
  if (!p) return base;
  if (e.tono === 'vencido') return `${base} · vencido hace ${cantidadHabil(p.restantes)}`;
  const unidad = cantidadHabil(p.restantes);
  const total = unidad.includes('días')
    ? formatoUnDecimal.format(p.total / HORAS_POR_DIA)
    : formatoUnDecimal.format(p.total);
  return `${base} · quedan ${unidad} de ${total}`;
}

const COLOR_TEXTO = {
  ok: 'text-tinta-2',
  neutro: 'text-tinta-2',
  atento: 'text-plazo-atento',
  vencido: 'font-medium text-plazo-vencido',
} as const;

const COLOR_BARRA = {
  ok: 'bg-plazo-ok',
  neutro: 'bg-tinta-4',
  atento: 'bg-plazo-atento',
  vencido: 'bg-plazo-vencido',
} as const;

// Plazo hábil del ticket: texto + línea de 3 px debajo (decorativa; la información está en el texto).
export function FranjaPlazo({
  ticket,
  variante = 'lista',
  className,
}: {
  ticket: DatosPlazo;
  variante?: 'lista' | 'ancha';
  className?: string;
}) {
  const e = estadoPlazo(ticket);
  const ancha = variante === 'ancha';
  const texto = ancha ? textoPlazoAncho(ticket) : textoPlazo(ticket);

  // Ancho de la línea: resuelto y vencido llenan toda; sin proporción conocida no hay línea.
  let ancho: number | null = null;
  if (ticket.fecha_limite !== null) {
    if (e.resuelto || e.tono === 'vencido') ancho = 100;
    else if (e.fraccion !== null) ancho = Math.round(e.fraccion * 100);
  }

  return (
    <div data-tono={e.tono} className={cn('flex flex-col gap-1 text-xs tabular-nums', className)}>
      <span
        {...(ticket.fecha_limite ? { title: formatearFechaHora(ticket.fecha_limite) } : {})}
        className={cn(e.resuelto ? 'text-tinta-2' : COLOR_TEXTO[e.tono])}
      >
        {texto}
      </span>
      {ancho !== null ? (
        <span
          aria-hidden="true"
          data-franja="barra"
          className={cn(
            'h-[3px] w-full overflow-hidden rounded-[1px] bg-panel-hundido',
            ancha ? 'max-w-[500px]' : 'max-w-[120px]',
          )}
        >
          <span
            className={cn('block h-full', e.resuelto ? COLOR_BARRA.neutro : COLOR_BARRA[e.tono])}
            style={{ width: `${ancho}%` }}
          />
        </span>
      ) : null}
      {ancha && ticket.plazo_habil && ticket.fecha_limite ? (
        <span className="text-tinta-3">
          Horario hábil del departamento · colación y feriados excluidos
        </span>
      ) : null}
    </div>
  );
}
