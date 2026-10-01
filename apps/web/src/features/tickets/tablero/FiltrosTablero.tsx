import {
  PRIORIDADES,
  ETIQUETA_PRIORIDAD,
  TIPOS_TICKET,
  type Prioridad,
  type TipoTicket,
} from '@zydesk/shared';
import { ChevronDown } from 'lucide-react';
import { SelectorPersonas } from '@/components/dominio/SelectorPersonas';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ETIQUETA_TIPO_TICKET } from '../tipos';
import { BuscadorTickets } from './BuscadorTickets';

export interface ValoresFiltrosTablero {
  q: string;
  responsable: number | null;
  prioridad: Prioridad[];
  soloMios: boolean;
  tipo: TipoTicket[];
}

// Barra de filtros del tablero; el estado vive en la URL (lo maneja la página).
export function FiltrosTablero({
  valores,
  onCambio,
}: {
  valores: ValoresFiltrosTablero;
  onCambio: (cambios: Partial<ValoresFiltrosTablero>) => void;
}) {
  const etiquetaPrioridad =
    valores.prioridad.length === 0
      ? 'Prioridad'
      : `Prioridad: ${valores.prioridad.map((p) => ETIQUETA_PRIORIDAD[p]).join(', ')}`;

  const etiquetaTipo =
    valores.tipo.length === 0
      ? 'Tipo'
      : `Tipo: ${valores.tipo.map((t) => ETIQUETA_TIPO_TICKET[t]).join(', ')}`;

  return (
    <div
      role="search"
      aria-label="Filtros del tablero"
      className="flex flex-wrap items-center gap-3"
    >
      <BuscadorTickets valor={valores.q} onCambio={(q) => onCambio({ q })} />
      <div className="w-full sm:w-56">
        <SelectorPersonas
          etiqueta="Responsable"
          placeholder="Responsable"
          valor={valores.responsable}
          onChange={(valor) => onCambio({ responsable: valor })}
          className="h-11 lg:h-9"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label={etiquetaPrioridad} className="font-normal">
            {etiquetaPrioridad}
            <ChevronDown aria-hidden="true" className="opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {PRIORIDADES.map((p) => (
            <DropdownMenuCheckboxItem
              key={p}
              className="min-h-11 lg:min-h-8"
              checked={valores.prioridad.includes(p)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(marcado) =>
                onCambio({
                  prioridad: PRIORIDADES.filter((x) =>
                    x === p ? marcado : valores.prioridad.includes(x),
                  ),
                })
              }
            >
              {ETIQUETA_PRIORIDAD[p]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Label htmlFor="solo-mios" className="flex min-h-11 cursor-pointer items-center gap-2">
        <Switch
          id="solo-mios"
          checked={valores.soloMios}
          onCheckedChange={(v) => onCambio({ soloMios: v })}
        />
        Solo míos
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label={etiquetaTipo} className="font-normal">
            {etiquetaTipo}
            <ChevronDown aria-hidden="true" className="opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {TIPOS_TICKET.map((t) => (
            <DropdownMenuCheckboxItem
              key={t}
              className="min-h-11 lg:min-h-8"
              checked={valores.tipo.includes(t)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(marcado) =>
                onCambio({
                  tipo: TIPOS_TICKET.filter((x) => (x === t ? marcado : valores.tipo.includes(x))),
                })
              }
            >
              {ETIQUETA_TIPO_TICKET[t]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
