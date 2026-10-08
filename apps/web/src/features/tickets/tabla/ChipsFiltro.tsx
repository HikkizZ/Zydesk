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
    <div role="group" aria-label="Filtros rápidos" className="flex flex-wrap gap-1.5">
      {CHIPS.map((c) => {
        const n = contadores[c.clave];
        const boton = (
          <button
            type="button"
            aria-pressed={activo === c.clave}
            disabled={c.deshabilitado !== undefined}
            onClick={() => onElegir(c.clave)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-md border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-8',
              activo === c.clave
                ? 'border-acento/40 bg-acento-suave text-acento'
                : 'border-linea-campo bg-panel text-tinta-2 hover:bg-lienzo',
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
