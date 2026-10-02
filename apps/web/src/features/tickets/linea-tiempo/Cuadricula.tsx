import { Avatar } from '@/components/dominio/Avatar';
import type { DiaLineaTiempoDatos, ItemLineaTiempoDatos } from '@/features/tickets/api';
import { cn } from '@/lib/utils';
import { BarraTicket } from './BarraTicket';
import { disponerBarras, enCursoDe, type FilaDatos } from './disposicion';

const ANCHO_NOMBRES = '14rem';
const ANCHO_MIN_COLUMNA = '72px';

const plantillaColumnas = (n: number) =>
  `${ANCHO_NOMBRES} repeat(${n}, minmax(${ANCHO_MIN_COLUMNA}, 1fr))`;
const anchoMinimo = (n: number) => `calc(${ANCHO_NOMBRES} + ${n} * ${ANCHO_MIN_COLUMNA})`;

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// "Mar 29" a partir de `AAAA-MM-DD` (sin zona).
export function etiquetaDia(fecha: string) {
  const [anio, mes, dia] = fecha.split('-').map(Number) as [number, number, number];
  return `${DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()]} ${dia}`;
}

const recortar = (texto: string, max: number) =>
  texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;

function Cabecera({ columnas }: { columnas: DiaLineaTiempoDatos[] }) {
  return (
    <div
      className="grid border-b bg-superficie-suave"
      style={{ gridTemplateColumns: plantillaColumnas(columnas.length) }}
    >
      <div className="sticky left-0 z-10 flex items-center bg-superficie-suave px-3 text-xs font-semibold text-tinta-2 uppercase">
        Equipo
      </div>
      {columnas.map((d) => (
        <div
          key={d.fecha}
          data-dia={d.fecha}
          data-hoy={d.hoy}
          className={cn(
            'flex h-12 items-center justify-center border-l text-sm',
            d.hoy ? 'bg-acento font-semibold text-white' : 'text-tinta-2',
          )}
        >
          {etiquetaDia(d.fecha)}
        </div>
      ))}
    </div>
  );
}

function Fila({
  fila,
  columnas,
  hoy,
  items,
  mostrarAhora,
}: {
  fila: FilaDatos;
  columnas: DiaLineaTiempoDatos[];
  hoy: string;
  items: ItemLineaTiempoDatos[];
  mostrarAhora: boolean;
}) {
  const { barras, subfilas } = disponerBarras(items, columnas, hoy);
  const ahora = mostrarAhora && fila.persona ? enCursoDe(fila.items, fila.persona.id) : undefined;
  return (
    <li
      data-fila={fila.clave}
      className="grid border-b last:border-b-0"
      style={{
        gridTemplateColumns: plantillaColumnas(columnas.length),
        gridTemplateRows: `repeat(${subfilas}, minmax(2rem, auto))`,
      }}
    >
      <div
        className="sticky left-0 z-10 flex min-h-14 items-center gap-2 bg-superficie px-3 py-2"
        style={{ gridColumn: 1, gridRow: `1 / span ${subfilas}` }}
      >
        {fila.persona ? (
          <Avatar iniciales={fila.persona.iniciales} color={fila.persona.color_avatar} />
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{fila.nombre}</p>
          {mostrarAhora && fila.persona ? (
            <p className="truncate text-xs text-tinta-2">
              {ahora ? `${ahora.codigo} ${recortar(ahora.asunto, 28)}` : 'Sin ticket en curso'}
            </p>
          ) : null}
        </div>
      </div>
      {columnas.map((d, i) => (
        <div
          key={d.fecha}
          aria-hidden="true"
          className={cn('border-l', d.hoy && 'bg-acento/5')}
          style={{ gridColumn: i + 2, gridRow: `1 / span ${subfilas}` }}
        />
      ))}
      {barras.map((b) => (
        <BarraTicket key={b.item.id} barra={b} />
      ))}
    </li>
  );
}

// Cuadrícula con CSS Grid (ADR 0011): la columna de nombres queda fija al desplazar en horizontal.
export function Cuadricula({
  columnas,
  filas,
  hoy,
  soloVencidos,
  mostrarAhora,
}: {
  columnas: DiaLineaTiempoDatos[];
  filas: FilaDatos[];
  hoy: string;
  soloVencidos: boolean;
  mostrarAhora: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-borde bg-superficie">
      <div style={{ minWidth: anchoMinimo(columnas.length) }}>
        <Cabecera columnas={columnas} />
        <ul aria-label="Filas de la línea de tiempo">
          {filas.map((fila) => (
            <Fila
              key={fila.clave}
              fila={fila}
              columnas={columnas}
              hoy={hoy}
              items={soloVencidos ? fila.items.filter((i) => i.vencido) : fila.items}
              mostrarAhora={mostrarAhora}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
