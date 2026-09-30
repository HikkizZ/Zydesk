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
    <section className="rounded-lg border border-borde bg-superficie p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {acciones}
      </div>
      {children}
    </section>
  );
}
