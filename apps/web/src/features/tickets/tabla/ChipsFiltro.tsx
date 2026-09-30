import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CHIPS, type ClaveChip } from './filtros';

// Filtros rápidos de la Tabla, con su contador entre paréntesis (si ya se conoce).
export function ChipsFiltro({
  activo,
  contadores,
  onElegir,
}: {
  activo: ClaveChip;
  contadores: Partial<Record<ClaveChip, number>>;
  onElegir: (clave: ClaveChip) => void;
}) {
  return (
    <div role="group" aria-label="Filtros rápidos" className="flex flex-wrap gap-2">
      {CHIPS.map((c) => {
        const n = contadores[c.clave];
        const boton = (
          <button
            type="button"
            aria-pressed={activo === c.clave}
            disabled={c.deshabilitado !== undefined}
            onClick={() => onElegir(c.clave)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-9',
              activo === c.clave
                ? 'border-acento bg-acento text-white'
                : 'border-borde-campo bg-superficie hover:bg-superficie-suave',
            )}
          >
            {c.etiqueta}
            {n === undefined ? '' : ` (${n})`}
          </button>
        );
        return c.deshabilitado ? (
          <Tooltip key={c.clave}>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex">
                {boton}
              </span>
            </TooltipTrigger>
            <TooltipContent>{c.deshabilitado}</TooltipContent>
          </Tooltip>
        ) : (
          <span key={c.clave} className="inline-flex">
            {boton}
          </span>
        );
      })}
    </div>
  );
}
