import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TicketDatos } from '@/features/tickets/api';

// "Convertir en OT" / "Crear otra OT" (si ya hay alguna no cancelada); deshabilitado con el ticket cerrado.
export function BotonConvertir({
  ticket,
  onConvertir,
  variante = 'outline',
  textoPrimero = 'Convertir en OT',
}: {
  ticket: TicketDatos;
  onConvertir: () => void;
  variante?: 'outline' | 'default';
  textoPrimero?: string;
}) {
  const hayOt = ticket.ots.some((o) => o.etapa !== 'cancelada');
  const texto = hayOt ? 'Crear otra OT' : textoPrimero;
  if (ticket.cerrado_en !== null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            <Button type="button" variant={variante} disabled>
              {texto}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Reabre el ticket</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button type="button" variant={variante} onClick={onConvertir}>
      {texto}
    </Button>
  );
}
