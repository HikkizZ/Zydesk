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
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-borde-campo bg-superficie-suave-2 px-6 py-10 text-center">
      <p className="font-titulo text-lg font-semibold">{titulo}</p>
      {descripcion ? <p className="max-w-md text-sm text-tinta-2">{descripcion}</p> : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}
