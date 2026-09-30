import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/dominio/Avatar';
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
import { usuarios } from '@/features/configuracion/api';
import { claves } from '@/features/tickets/api';
import { cn } from '@/lib/utils';
import type { UsuarioSalidaDatos } from '@zydesk/shared';

// Personas activas del equipo; la API no pagina (≤ 50 personas).
export function useUsuariosActivos() {
  return useQuery({
    queryKey: claves.usuariosActivos,
    queryFn: () => usuarios({ activo: 'true' }),
    staleTime: 5 * 60_000,
  });
}

type PropsComunes = {
  etiqueta: string;
  /** Ids que no se ofrecen (p. ej. el responsable principal en "Otros"). */
  excluir?: number[] | undefined;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

type Props =
  | (PropsComunes & { multiple: true; valor: number[]; onChange: (valor: number[]) => void })
  | (PropsComunes & {
      multiple?: false;
      valor: number | null;
      onChange: (valor: number | null) => void;
    });

function FilaPersona({ persona }: { persona: UsuarioSalidaDatos }) {
  return (
    <>
      <Avatar
        iniciales={persona.iniciales}
        color={persona.color_avatar}
        className="size-6 text-[10px]"
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{persona.nombre}</span>
        {persona.departamento ? (
          <span className="truncate text-xs text-tinta-2">{persona.departamento.nombre}</span>
        ) : null}
      </span>
    </>
  );
}

// Lista de personas con búsqueda (Popover + Command). `multiple` elige varias; si no, una o ninguna.
export function SelectorPersonas(props: Props) {
  const { etiqueta, excluir, placeholder, disabled, id, className } = props;
  const [abierto, setAbierto] = useState(false);
  const consulta = useUsuariosActivos();
  const personas = (consulta.data ?? []).filter((p) => !excluir?.includes(p.id));
  const seleccion = props.multiple ? props.valor : props.valor === null ? [] : [props.valor];
  const elegidas = (consulta.data ?? []).filter((p) => seleccion.includes(p.id));

  const alElegir = (personaId: number) => {
    if (props.multiple) {
      props.onChange(
        props.valor.includes(personaId)
          ? props.valor.filter((x) => x !== personaId)
          : [...props.valor, personaId],
      );
    } else {
      props.onChange(props.valor === personaId ? null : personaId);
      setAbierto(false);
    }
  };

  const resumen =
    elegidas.length === 0
      ? (placeholder ?? (props.multiple ? 'Agregar personas' : 'Elegir persona'))
      : elegidas.map((p) => p.nombre).join(', ');

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          aria-label={`${etiqueta}: ${elegidas.length === 0 ? 'sin selección' : resumen}`}
          {...(disabled === undefined ? {} : { disabled })}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {elegidas.slice(0, 3).map((p) => (
              <Avatar
                key={p.id}
                iniciales={p.iniciales}
                color={p.color_avatar}
                className="size-5 text-[9px]"
              />
            ))}
            <span className={cn('truncate', elegidas.length === 0 && 'text-muted-foreground')}>
              {resumen}
            </span>
          </span>
          <ChevronsUpDown aria-hidden="true" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command>
          <CommandInput placeholder="Buscar persona…" aria-label={`Buscar ${etiqueta}`} />
          <CommandList>
            <CommandEmpty>
              {consulta.isPending ? 'Cargando…' : 'Nadie coincide con la búsqueda'}
            </CommandEmpty>
            <CommandGroup>
              {!props.multiple && props.valor !== null ? (
                <CommandItem
                  value="__ninguno__"
                  onSelect={() => {
                    props.onChange(null);
                    setAbierto(false);
                  }}
                >
                  <span className="text-tinta-2">Quitar selección</span>
                </CommandItem>
              ) : null}
              {personas.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.nombre} ${p.departamento?.nombre ?? ''}`}
                  onSelect={() => alElegir(p.id)}
                >
                  <FilaPersona persona={p} />
                  {seleccion.includes(p.id) ? (
                    <Check aria-label="Seleccionada" className="ml-auto" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
