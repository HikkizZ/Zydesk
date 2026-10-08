import { useQuery } from '@tanstack/react-query';
import { obtener } from '@/lib/api';
import type { Salud } from './api';

export function EstadoSistema() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['salud'],
    queryFn: () => obtener<Salud>('/api/salud'),
    refetchInterval: 30_000,
  });

  let contenido;
  if (isPending) {
    contenido = <p className="text-sm text-tinta-2">Comprobando…</p>;
  } else if (isError || data.bd === 'error') {
    contenido = (
      <p className="text-sm text-plazo-vencido">Sin conexión con la API / la base de datos</p>
    );
  } else {
    contenido = (
      <p className="text-sm text-plazo-ok">API: ok · Base de datos: ok · versión {data.version}</p>
    );
  }

  return (
    <section className="rounded-md border border-linea bg-panel p-4">
      <h2 className="mb-2 text-sm font-semibold text-tinta">Estado del sistema</h2>
      {contenido}
    </section>
  );
}
