import { useEffect, type ReactNode } from 'react';
import { useMigas } from './proveedores';

interface Props {
  titulo: string;
  // Con `codigo` (p. ej. "TK-1048") la pestaña dice "TK-1048 · Zydesk" y la miga final lo muestra.
  codigo?: string;
  contador?: number;
  subtitulo?: string;
  acciones?: ReactNode;
}

function useTituloDeDocumento(titulo: string, codigo?: string) {
  useEffect(() => {
    document.title = `${codigo ?? titulo} · Zydesk`;
  }, [titulo, codigo]);
}

export function CabeceraPagina({ titulo, codigo, contador, subtitulo, acciones }: Props) {
  useTituloDeDocumento(titulo, codigo);
  useMigas({ codigo });
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-tinta">
          {titulo}
          {contador !== undefined ? (
            <span className="ml-2 rounded-sm border border-linea bg-panel px-1.5 text-xs font-medium text-tinta-2 tabular-nums">
              {contador}
            </span>
          ) : null}
        </h1>
        {subtitulo ? <p className="mt-1 text-xs text-tinta-3">{subtitulo}</p> : null}
      </div>
      {acciones ? <div className="flex items-center gap-2">{acciones}</div> : null}
    </div>
  );
}
