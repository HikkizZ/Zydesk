import { cn } from '@/lib/utils';
import { CHIPS_OT, type ClaveChipOt } from './filtros';

// Filtros rápidos de la lista de OT, con su contador entre paréntesis (si ya se conoce).
export function ChipsOts({
  activo,
  contadores,
  onElegir,
}: {
  activo: ClaveChipOt;
  contadores: Partial<Record<ClaveChipOt, number>>;
  onElegir: (clave: ClaveChipOt) => void;
}) {
  return (
    <div role="group" aria-label="Filtros rápidos" className="flex flex-wrap gap-2">
      {CHIPS_OT.map((c) => {
        const n = contadores[c.clave];
        return (
          <button
            key={c.clave}
            type="button"
            aria-pressed={activo === c.clave}
            onClick={() => onElegir(c.clave)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none lg:min-h-9',
              activo === c.clave
                ? 'border-acento bg-acento text-white'
                : 'border-borde-campo bg-superficie hover:bg-superficie-suave',
            )}
          >
            {c.etiqueta}
            {n === undefined ? '' : ` (${n})`}
          </button>
        );
      })}
    </div>
  );
}
