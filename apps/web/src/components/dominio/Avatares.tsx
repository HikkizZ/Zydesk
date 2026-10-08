import { Avatar } from '@/components/dominio/Avatar';
import type { UsuarioBreveDatos } from '@/features/tickets/api';

// Pila de avatares (24 px, anillo del color del panel, solapados); el texto oculto da los nombres a lectores de pantalla.
export function Avatares({ personas, max = 3 }: { personas: UsuarioBreveDatos[]; max?: number }) {
  const visibles = personas.slice(0, max);
  const sobran = personas.length - visibles.length;
  return (
    <span className="inline-flex items-center">
      {visibles.map((p, i) => (
        <span key={p.id} title={p.nombre} className={i === 0 ? '' : '-ml-1.5'}>
          <Avatar
            iniciales={p.iniciales}
            color={p.color_avatar}
            className="size-6 text-[10px] ring-2 ring-panel"
          />
        </span>
      ))}
      {sobran > 0 ? (
        <span
          aria-hidden="true"
          className="-ml-1.5 inline-flex size-6 items-center justify-center rounded-full border border-linea-suave bg-panel-hundido text-[10px] font-medium text-tinta-2 ring-2 ring-panel"
        >
          +{sobran}
        </span>
      ) : null}
      <span className="sr-only">{personas.map((p) => p.nombre).join(', ')}</span>
    </span>
  );
}
