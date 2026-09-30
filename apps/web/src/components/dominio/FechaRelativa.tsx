import { formatearFechaHora } from '@/lib/fechas';
import { tiempoRelativo } from '@/components/dominio/formato-fecha';

export function FechaRelativa({ fecha, ahora }: { fecha: string; ahora?: Date }) {
  return (
    <time dateTime={fecha} title={formatearFechaHora(fecha)}>
      {tiempoRelativo(fecha, ahora)}
    </time>
  );
}
