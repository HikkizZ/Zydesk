import { useEsMovil } from '@/lib/useMediaQuery';

export interface SeccionAtajo {
  id: string;
  etiqueta: string;
}

// Fila de chips con anclas a las secciones de una página de detalle; solo existe bajo 1024 px.
export function AtajosSecciones({
  etiqueta,
  secciones,
}: {
  etiqueta: string;
  secciones: SeccionAtajo[];
}) {
  const esMovil = useEsMovil();
  if (!esMovil) return null;
  return (
    <nav
      aria-label={etiqueta}
      className="-mx-6 mt-4 flex gap-2 overflow-x-auto px-6 pb-1 lg:hidden"
    >
      {secciones.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-borde bg-superficie px-3 text-sm"
        >
          {s.etiqueta}
        </a>
      ))}
    </nav>
  );
}
