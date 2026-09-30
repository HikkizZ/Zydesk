import { Avatar } from '@/components/dominio/Avatar';
import type { UsuarioBreveDatos } from '@/features/tickets/api';

// Pila de avatares (26 px, borde blanco, solapados); el texto oculto da los nombres a lectores de pantalla.
export function Avatares({ personas, max = 3 }: { personas: UsuarioBreveDatos[]; max?: number }) {
  const visibles = personas.slice(0, max);
  const sobran = personas.length - visibles.length;
  return (
    <span className="inline-flex items-center">
      {visibles.map((p, i) => (
        <span key={p.id} title={p.nombre} className={i === 0 ? '' : '-ml-[7px]'}>
          <Avatar
            iniciales={p.iniciales}
            color={p.color_avatar}
            className="size-[26px] border-2 border-superficie text-[10px]"
          />
        </span>
      ))}
      {sobran > 0 ? (
        <span
          aria-hidden="true"
          className="-ml-[7px] inline-flex size-[26px] items-center justify-center rounded-full border-2 border-superficie bg-superficie-suave text-[10px] font-semibold"
        >
          +{sobran}
        </span>
      ) : null}
      <span className="sr-only">{personas.map((p) => p.nombre).join(', ')}</span>
    </span>
  );
}
