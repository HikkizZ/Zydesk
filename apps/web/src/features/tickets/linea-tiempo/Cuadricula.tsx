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
      className="grid border-b border-linea-fuerte bg-panel-hundido"
      style={{ gridTemplateColumns: plantillaColumnas(columnas.length) }}
    >
      <div className="sticky left-0 z-10 flex items-center bg-panel-hundido px-3 text-xs font-normal text-tinta-3">
        Equipo
      </div>
      {columnas.map((d) => (
        <div
          key={d.fecha}
          data-dia={d.fecha}
          data-hoy={d.hoy}
          className={cn(
            'flex h-9 items-center justify-center border-l border-linea text-xs',
            d.hoy ? 'bg-acento font-medium text-white' : 'text-tinta-3',
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
      className="grid border-b border-linea last:border-b-0"
      style={{
        gridTemplateColumns: plantillaColumnas(columnas.length),
        gridTemplateRows: `repeat(${subfilas}, minmax(2.25rem, auto))`,
      }}
    >
      <div
        className="sticky left-0 z-10 flex min-h-11 items-center gap-2 bg-panel px-3 py-2"
        style={{ gridColumn: 1, gridRow: `1 / span ${subfilas}` }}
      >
        {fila.persona ? (
          <Avatar iniciales={fila.persona.iniciales} color={fila.persona.color_avatar} />
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-tabla font-medium text-tinta">{fila.nombre}</p>
          {mostrarAhora && fila.persona ? (
            <p className="truncate text-xs text-tinta-3">
              {ahora ? `${ahora.codigo} ${recortar(ahora.asunto, 28)}` : 'Sin ticket en curso'}
            </p>
          ) : null}
        </div>
      </div>
      {columnas.map((d, i) => (
        <div
          key={d.fecha}
          aria-hidden="true"
          className={cn(
            'border-l border-linea',
            d.hoy && 'border-l-2 border-l-acento bg-acento-suave/40',
          )}
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
    <div className="overflow-x-auto rounded-md border border-linea-fuerte bg-panel">
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
