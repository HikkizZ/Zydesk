import type { ReactNode } from 'react';

export function Tarjeta({
  titulo,
  acciones,
  children,
}: {
  titulo: string;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-linea bg-panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-tinta">{titulo}</h2>
        {acciones}
      </div>
      {children}
    </section>
  );
}
