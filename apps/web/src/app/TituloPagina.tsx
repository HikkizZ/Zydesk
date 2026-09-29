import { useEffect } from 'react';

export function TituloPagina({ titulo }: { titulo: string }) {
  useEffect(() => {
    document.title = `${titulo} · Zydesk`;
  }, [titulo]);
  return <h1 className="font-titulo text-2xl font-bold">{titulo}</h1>;
}
