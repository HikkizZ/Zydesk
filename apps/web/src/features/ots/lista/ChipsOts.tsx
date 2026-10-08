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
    <div role="group" aria-label="Filtros rápidos" className="flex flex-wrap gap-1.5">
      {CHIPS_OT.map((c) => {
        const n = contadores[c.clave];
        return (
          <button
            key={c.clave}
            type="button"
            aria-pressed={activo === c.clave}
            onClick={() => onElegir(c.clave)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-md border px-3 text-sm transition-colors lg:min-h-8',
              activo === c.clave
                ? 'border-acento/30 bg-acento-suave font-medium text-acento'
                : 'border-linea-fuerte bg-panel text-tinta-2 hover:bg-panel-hundido hover:text-tinta',
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
