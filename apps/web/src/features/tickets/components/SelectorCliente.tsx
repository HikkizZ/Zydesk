import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
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
import { clientes, type ClienteResumenDatos } from '@/features/clientes/api';
import { cn } from '@/lib/utils';

export function useClientesActivos() {
  return useQuery({
    queryKey: ['clientes', 'activos'],
    queryFn: () => clientes(true),
    staleTime: 5 * 60_000,
  });
}

// Cliente o área interna con búsqueda, en dos grupos ("Clientes" y "Áreas internas").
export function SelectorCliente({
  valor,
  onChange,
  id,
  invalido,
  disabled,
}: {
  valor: number | null;
  onChange: (cliente: ClienteResumenDatos | null) => void;
  id?: string | undefined;
  invalido?: boolean | undefined;
  disabled?: boolean | undefined;
}) {
  const [abierto, setAbierto] = useState(false);
  const consulta = useClientesActivos();
  const lista = consulta.data ?? [];
  const elegido = lista.find((c) => c.id === valor);

  const grupo = (titulo: string, filas: ClienteResumenDatos[]) =>
    filas.length === 0 ? null : (
      <CommandGroup heading={titulo}>
        {filas.map((c) => (
          <CommandItem
            key={c.id}
            value={c.nombre}
            onSelect={() => {
              onChange(c);
              setAbierto(false);
            }}
          >
            {c.nombre}
            {c.id === valor ? <Check aria-label="Seleccionado" className="ml-auto" /> : null}
          </CommandItem>
        ))}
      </CommandGroup>
    );

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
          aria-label={`Cliente o área interna: ${elegido ? elegido.nombre : 'sin selección'}`}
          {...(disabled === undefined ? {} : { disabled })}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !elegido && 'text-muted-foreground')}>
            {elegido ? elegido.nombre : 'Elegir cliente o área interna'}
          </span>
          <ChevronsUpDown aria-hidden="true" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command>
          <CommandInput placeholder="Buscar cliente…" aria-label="Buscar cliente" />
          <CommandList>
            <CommandEmpty>
              {consulta.isPending ? 'Cargando…' : 'Nada coincide con la búsqueda'}
            </CommandEmpty>
            {valor !== null ? (
              <CommandGroup>
                <CommandItem
                  value="__sin_cliente__"
                  onSelect={() => {
                    onChange(null);
                    setAbierto(false);
                  }}
                >
                  <span className="text-tinta-2">Sin cliente</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {grupo(
              'Clientes',
              lista.filter((c) => !c.es_interno),
            )}
            {grupo(
              'Áreas internas',
              lista.filter((c) => c.es_interno),
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
