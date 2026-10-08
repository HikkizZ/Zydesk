import { useQuery } from '@tanstack/react-query';
import { Combo, type OpcionCombo } from '@/components/dominio/Combo';
import { clientes, type ClienteResumenDatos } from '@/features/clientes/api';

export function useClientesActivos() {
  return useQuery({
    queryKey: ['clientes', 'activos'],
    queryFn: () => clientes(true),
    staleTime: 5 * 60_000,
  });
}

// Cliente o área interna con búsqueda, en dos grupos ("Clientes" y "Áreas internas").
export function SelectorCliente({
  valor,
  onChange,
  id,
  invalido,
  disabled,
}: {
  valor: number | null;
  onChange: (cliente: ClienteResumenDatos | null) => void;
  id?: string | undefined;
  invalido?: boolean | undefined;
  disabled?: boolean | undefined;
}) {
  const consulta = useClientesActivos();
  const lista = consulta.data ?? [];
  const opciones: OpcionCombo<number>[] = [
    ...lista
      .filter((c) => !c.es_interno)
      .map((c) => ({ valor: c.id, etiqueta: c.nombre, grupo: 'Clientes' })),
    ...lista
      .filter((c) => c.es_interno)
      .map((c) => ({ valor: c.id, etiqueta: c.nombre, grupo: 'Áreas internas' })),
  ];

  return (
    <Combo
      opciones={opciones}
      etiqueta="Cliente o área interna"
      placeholder="Elegir cliente o área interna"
      placeholderBusqueda="Buscar cliente…"
      ariaBusqueda="Buscar cliente"
      textoVacio="Nada coincide con la búsqueda"
      cargando={consulta.isPending}
      valor={valor}
      alCambiar={(v) => onChange(v === null ? null : (lista.find((c) => c.id === v) ?? null))}
      textoQuitar="Sin cliente"
      id={id}
      invalido={invalido}
      disabled={disabled}
    />
  );
}
