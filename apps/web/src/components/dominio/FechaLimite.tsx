import { TriangleAlert } from 'lucide-react';
import { diaMes } from '@/components/dominio/formato-fecha';
import { cn } from '@/lib/utils';

// "Hoy" (con ícono) si vence hoy; "Vencido · 27 sep" si ya pasó; si no, "30 sep"; sin fecha, "Sin fecha".
export function FechaLimite({
  fecha_limite,
  vencido,
  vence_hoy,
  prefijo,
  className,
}: {
  fecha_limite: string | null;
  vencido: boolean;
  vence_hoy: boolean;
  prefijo?: string;
  className?: string;
}) {
  if (!fecha_limite) {
    return <span className={cn('text-sm text-tinta-3', className)}>Sin fecha</span>;
  }
  if (vencido || vence_hoy) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-sm font-semibold text-urgente',
          className,
        )}
      >
        <TriangleAlert aria-hidden="true" className="size-3.5" />
        {vence_hoy ? 'Hoy' : `Vencido · ${diaMes(fecha_limite)}`}
      </span>
    );
  }
  return (
    <span className={cn('text-sm', className)}>
      {prefijo ? `${prefijo} ` : ''}
      {diaMes(fecha_limite)}
    </span>
  );
}
