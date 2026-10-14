import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export function EstadoVacio({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-tinta-3">
      <Inbox aria-hidden="true" className="size-6 text-tinta-4" />
      <h3 className="text-sm font-medium text-tinta-2">{titulo}</h3>
      {descripcion ? <p className="max-w-md text-xs text-tinta-3">{descripcion}</p> : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}
