import { useEffect } from 'react';

// Con `codigo` (p. ej. "TK-1048") la pestaña dice "TK-1048 · Zydesk" y el `h1` sigue siendo el título.
export function TituloPagina({ titulo, codigo }: { titulo: string; codigo?: string }) {
  useEffect(() => {
    document.title = `${codigo ?? titulo} · Zydesk`;
  }, [titulo, codigo]);
  return <h1 className="font-titulo text-2xl font-bold">{titulo}</h1>;
}
