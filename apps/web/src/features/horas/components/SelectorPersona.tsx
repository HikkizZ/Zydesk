import { Combo } from '@/components/dominio/Combo';
import { useUsuariosActivos } from '@/components/dominio/SelectorPersonas';

// Solo con `horas.ver_todas`: la propia primero, luego el resto de las personas activas.
export function SelectorPersona({
  valor,
  yoId,
  actual,
  onCambiar,
}: {
  valor: number;
  yoId: number;
  /** Persona de la planilla en pantalla; se ofrece aunque esté inactiva. */
  actual?: { id: number; nombre: string } | undefined;
  onCambiar: (id: number) => void;
}) {
  const lista = useUsuariosActivos().data ?? [];
  const opciones = lista.map((u) => ({ id: u.id, nombre: u.nombre }));
  if (actual && !opciones.some((o) => o.id === actual.id)) opciones.push(actual);
  opciones.sort((a, b) =>
    a.id === yoId ? -1 : b.id === yoId ? 1 : a.nombre.localeCompare(b.nombre),
  );
  return (
    <Combo
      etiqueta="Persona"
      className="w-56"
      valor={valor}
      alCambiar={(id) => {
        if (id !== null) onCambiar(id);
      }}
      opciones={opciones.map((o) => ({
        valor: o.id,
        etiqueta: o.id === yoId ? `${o.nombre} (yo)` : o.nombre,
      }))}
    />
  );
}
