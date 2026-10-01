import { ChevronLeft, ChevronRight } from 'lucide-react';
import { hoyIso } from '@/components/dominio/formato-fecha';
import { Button } from '@/components/ui/button';
import type { PlanillaDatos } from '../api';
import { textoSemana } from '../utiles';

// "‹ Semana anterior · Semana del 28 sep al 4 oct 2026 · Siguiente ›" y "Hoy" si no es la actual.
export function SelectorSemana({
  semana,
  onCambiar,
  onHoy,
}: {
  semana: PlanillaDatos['semana'];
  onCambiar: (fecha: string) => void;
  onHoy: () => void;
}) {
  const siguienteFutura = semana.siguiente > hoyIso();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => onCambiar(semana.anterior)}>
        <ChevronLeft aria-hidden="true" />
        Semana anterior
      </Button>
      <span className="px-1 text-sm font-medium">{textoSemana(semana)}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={siguienteFutura}
        onClick={() => onCambiar(semana.siguiente)}
      >
        Siguiente
        <ChevronRight aria-hidden="true" />
      </Button>
      {semana.actual ? null : (
        <Button type="button" variant="ghost" size="sm" onClick={onHoy}>
          Hoy
        </Button>
      )}
    </div>
  );
}
