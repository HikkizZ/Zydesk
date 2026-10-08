import { diaMesDeFecha, hoyIso } from '@/components/dominio/formato-fecha';
import { cn } from '@/lib/utils';

// Término de una OT (fecha sin hora, sin franja: no hay plazo en horas). «Termina 12 oct» en tinta-2,
// «Termina hoy» en ámbar y «Vencida · 9 oct» en rojo.
export function TerminoOt({
  termino,
  vencida,
  final = false,
  className,
}: {
  termino: string | null;
  vencida: boolean;
  /** OT cerrada o cancelada: ya no "termina", "terminó". */
  final?: boolean;
  className?: string;
}) {
  if (!termino) return <span className={cn('text-tinta-3', className)}>—</span>;
  const fecha = diaMesDeFecha(termino);
  if (vencida) {
    return (
      <span className={cn('font-medium text-plazo-vencido', className)}>Vencida · {fecha}</span>
    );
  }
  if (!final && termino === hoyIso()) {
    return <span className={cn('text-plazo-atento', className)}>Termina hoy</span>;
  }
  return (
    <span className={cn('text-tinta-2', className)}>
      {final ? 'Terminó' : 'Termina'} {fecha}
    </span>
  );
}
