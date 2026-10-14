import { Check, ChevronsUpDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Chip } from '@/components/dominio/Chip';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type ValorCombo = string | number;

export interface OpcionCombo<V extends ValorCombo = number> {
  valor: V;
  etiqueta: string;
  detalle?: string | undefined;
  /** Rótulo del grupo (los grupos salen en el orden de la primera opción que los usa). */
  grupo?: string | undefined;
  /** Contenido antes del texto (p. ej. un avatar). */
  inicio?: ReactNode;
  deshabilitada?: boolean | undefined;
}

interface PropsLista<V extends ValorCombo> {
  opciones: OpcionCombo<V>[];
  esElegida: (valor: V) => boolean;
  alElegir: (opcion: OpcionCombo<V>) => void;
  placeholderBusqueda?: string | undefined;
  ariaBusqueda?: string | undefined;
  textoVacio?: string | undefined;
  cargando?: boolean | undefined;
  /** `false` cuando la búsqueda la hace el servidor (se controla con `busqueda` y `alBuscar`). */
  filtrar?: boolean | undefined;
  busqueda?: string | undefined;
  alBuscar?: ((texto: string) => void) | undefined;
  /** Primera fila «Quitar selección» (o «Sin cliente»…). */
  quitar?: { texto: string; alQuitar: () => void } | undefined;
  className?: string | undefined;
}

function ContenidoOpcion<V extends ValorCombo>({ opcion }: { opcion: OpcionCombo<V> }) {
  return (
    <>
      {opcion.inicio}
      <span className="flex min-w-0 flex-col">
        <span className={cn('truncate', opcion.deshabilitada && 'text-tinta-3')}>
          {opcion.etiqueta}
        </span>
        {opcion.detalle ? (
          <span className="truncate text-xs text-tinta-2">{opcion.detalle}</span>
        ) : null}
      </span>
    </>
  );
}

// Búsqueda + lista de opciones (`Command`). Es el cuerpo del popover de `Combo` y también sirve en línea
// (p. ej. el buscador de tickets y OT al agregar una fila de horas).
export function ListaCombo<V extends ValorCombo>({
  opciones,
  esElegida,
  alElegir,
  placeholderBusqueda = 'Buscar…',
  ariaBusqueda,
  textoVacio = 'Sin resultados',
  cargando,
  filtrar = true,
  busqueda,
  alBuscar,
  quitar,
  className,
}: PropsLista<V>) {
  const grupos: Array<{ titulo: string | undefined; filas: OpcionCombo<V>[] }> = [];
  for (const o of opciones) {
    const g = grupos.find((x) => x.titulo === o.grupo);
    if (g) g.filas.push(o);
    else grupos.push({ titulo: o.grupo, filas: [o] });
  }
  // Sin grupo primero, como en una lista simple.
  grupos.sort((a, b) => Number(a.titulo !== undefined) - Number(b.titulo !== undefined));

  const entradaBusqueda =
    busqueda === undefined ? {} : { value: busqueda, onValueChange: (v: string) => alBuscar?.(v) };

  return (
    <Command shouldFilter={filtrar} className={className}>
      <CommandInput
        placeholder={placeholderBusqueda}
        aria-label={ariaBusqueda ?? placeholderBusqueda.replace(/…$/, '')}
        {...entradaBusqueda}
      />
      <CommandList>
        <CommandEmpty>{cargando ? 'Cargando…' : textoVacio}</CommandEmpty>
        {quitar ? (
          <CommandGroup>
            <CommandItem value="__quitar__" onSelect={quitar.alQuitar}>
              <span className="text-tinta-2">{quitar.texto}</span>
            </CommandItem>
          </CommandGroup>
        ) : null}
        {grupos.map((g) => (
          <CommandGroup
            key={g.titulo ?? '__sin_grupo__'}
            {...(g.titulo ? { heading: g.titulo } : {})}
          >
            {g.filas.map((o) => (
              <CommandItem
                key={String(o.valor)}
                value={String(o.valor)}
                keywords={[o.etiqueta, ...(o.detalle ? [o.detalle] : [])]}
                disabled={o.deshabilitada ?? false}
                onSelect={() => alElegir(o)}
              >
                <ContenidoOpcion opcion={o} />
                {esElegida(o.valor) ? (
                  <Check aria-label="Seleccionado" className="ml-auto shrink-0 text-acento" />
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

interface PropsComunes<V extends ValorCombo> {
  opciones: OpcionCombo<V>[];
  /** Nombre accesible del campo («Cliente», «Principal»…). */
  etiqueta: string;
  placeholder?: string | undefined;
  placeholderBusqueda?: string | undefined;
  ariaBusqueda?: string | undefined;
  textoVacio?: string | undefined;
  cargando?: boolean | undefined;
  disabled?: boolean | undefined;
  invalido?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
}

export type PropsCombo<V extends ValorCombo = number> =
  | (PropsComunes<V> & {
      multiple?: false;
      valor: V | null;
      alCambiar: (valor: V | null) => void;
      /** Con valor elegido, ofrece esta fila para dejarlo vacío. */
      textoQuitar?: string | undefined;
      /** Elegir otra vez la opción ya elegida la quita. */
      alternar?: boolean | undefined;
    })
  | (PropsComunes<V> & { multiple: true; valor: V[]; alCambiar: (valor: V[]) => void });

// Selector con búsqueda (Popover + Command) para listas largas o con nombres largos (ADR 0033).
// Para listas cortas y cerradas se usa `Select`.
export function Combo<V extends ValorCombo = number>(props: PropsCombo<V>) {
  const {
    opciones,
    etiqueta,
    placeholder,
    placeholderBusqueda,
    ariaBusqueda,
    textoVacio,
    cargando,
    disabled,
    invalido,
    id,
    className,
  } = props;
  const [abierto, setAbierto] = useState(false);
  const seleccion: V[] = props.multiple ? props.valor : props.valor === null ? [] : [props.valor];
  const elegidas = opciones.filter((o) => seleccion.includes(o.valor));
  const resumen =
    elegidas.length === 0 ? 'sin selección' : elegidas.map((o) => o.etiqueta).join(', ');
  const textoPlaceholder = placeholder ?? (props.multiple ? 'Agregar…' : 'Elegir…');

  const alElegir = (opcion: OpcionCombo<V>) => {
    if (props.multiple) {
      props.alCambiar(
        props.valor.includes(opcion.valor)
          ? props.valor.filter((x) => x !== opcion.valor)
          : [...props.valor, opcion.valor],
      );
    } else {
      props.alCambiar(props.alternar && props.valor === opcion.valor ? null : opcion.valor);
      setAbierto(false);
    }
  };

  const quitar =
    !props.multiple && props.valor !== null && props.textoQuitar
      ? {
          texto: props.textoQuitar,
          alQuitar: () => {
            props.alCambiar(null);
            setAbierto(false);
          },
        }
      : undefined;

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          aria-invalid={invalido}
          aria-label={`${etiqueta}: ${resumen}`}
          {...(disabled === undefined ? {} : { disabled })}
          className={cn(
            'w-full justify-between rounded-sm border-linea-campo px-2.5 font-normal lg:h-9',
            className,
          )}
        >
          {elegidas.length === 0 ? (
            <span className="truncate text-tinta-3">{textoPlaceholder}</span>
          ) : props.multiple ? (
            <span className="flex min-w-0 items-center gap-1">
              {elegidas.slice(0, 2).map((o) => (
                <Chip key={String(o.valor)} className="min-w-0 max-w-full">
                  {o.inicio}
                  <span className="truncate">{o.etiqueta}</span>
                </Chip>
              ))}
              {elegidas.length > 2 ? <Chip>+{elegidas.length - 2}</Chip> : null}
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              {elegidas[0]?.inicio}
              <span className="truncate">{elegidas[0]?.etiqueta}</span>
            </span>
          )}
          <ChevronsUpDown aria-hidden="true" className="text-tinta-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64">
        <ListaCombo
          opciones={opciones}
          esElegida={(v) => seleccion.includes(v)}
          alElegir={alElegir}
          placeholderBusqueda={placeholderBusqueda ?? 'Buscar…'}
          ariaBusqueda={ariaBusqueda ?? `Buscar ${etiqueta}`}
          textoVacio={textoVacio}
          cargando={cargando}
          quitar={quitar}
        />
      </PopoverContent>
    </Popover>
  );
}
