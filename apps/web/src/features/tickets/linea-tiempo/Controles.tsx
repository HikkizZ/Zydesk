import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ESCALAS, ETIQUETA_ESCALA, type Escala } from './rango';

export type Agrupar = 'persona' | 'cliente';

function Opciones<T extends string>({
  etiqueta,
  opciones,
  valor,
  onElegir,
}: {
  etiqueta: string;
  opciones: { clave: T; etiqueta: string }[];
  valor: T;
  onElegir: (clave: T) => void;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex rounded-lg border bg-superficie">
      {opciones.map((o) => (
        <button
          key={o.clave}
          type="button"
          aria-pressed={valor === o.clave}
          onClick={() => onElegir(o.clave)}
          className={cn(
            'min-h-11 px-3 text-sm font-medium first:rounded-l-lg last:rounded-r-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none lg:min-h-9',
            valor === o.clave ? 'bg-acento text-white' : 'hover:bg-superficie-suave',
          )}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

export function Controles({
  escala,
  agrupar,
  etiquetaRango,
  onEscala,
  onAgrupar,
  onMover,
  onHoy,
}: {
  escala: Escala;
  agrupar: Agrupar;
  etiquetaRango: string;
  onEscala: (e: Escala) => void;
  onAgrupar: (a: Agrupar) => void;
  onMover: (sentido: 1 | -1) => void;
  onHoy: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Rango anterior"
          onClick={() => onMover(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Rango siguiente"
          onClick={() => onMover(1)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        <Button variant="outline" onClick={onHoy}>
          Hoy
        </Button>
      </div>
      <p className="font-medium" aria-live="polite">
        {etiquetaRango}
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        <Opciones
          etiqueta="Agrupar por"
          opciones={[
            { clave: 'persona', etiqueta: 'Persona' },
            { clave: 'cliente', etiqueta: 'Cliente' },
          ]}
          valor={agrupar}
          onElegir={onAgrupar}
        />
        <Opciones
          etiqueta="Escala"
          opciones={ESCALAS.map((e) => ({ clave: e, etiqueta: ETIQUETA_ESCALA[e] }))}
          valor={escala}
          onElegir={onEscala}
        />
      </div>
    </div>
  );
}
