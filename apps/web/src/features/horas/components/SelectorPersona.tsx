import { useUsuariosActivos } from '@/components/dominio/SelectorPersonas';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    <div className="flex items-center gap-2">
      <Label htmlFor="selector-persona" className="text-sm text-tinta-2">
        Persona
      </Label>
      <Select value={String(valor)} onValueChange={(v) => onCambiar(Number(v))}>
        <SelectTrigger id="selector-persona" className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opciones.map((o) => (
            <SelectItem key={o.id} value={String(o.id)}>
              {o.id === yoId ? `${o.nombre} (yo)` : o.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
