import { Send } from 'lucide-react';
import type { EventoAviso } from '@zydesk/shared';
import { Link } from 'react-router';
import { FechaRelativa } from '@/components/dominio/FechaRelativa';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { AvisoDatos } from '../api';

// Glifo del diseño por evento; el `aria-label` nombra el tipo (nunca solo el símbolo).
const GLIFOS: Record<EventoAviso, { glifo: string; etiqueta: string }> = {
  mencion: { glifo: '@', etiqueta: 'Mención' },
  asignacion: { glifo: '+', etiqueta: 'Asignación' },
  vence_pronto: { glifo: '!', etiqueta: 'Vencimiento' },
  vencio: { glifo: '!', etiqueta: 'Vencimiento' },
  cotizacion: { glifo: '$', etiqueta: 'Cotización' },
  por_facturar: { glifo: '$', etiqueta: 'Facturación' },
  estado_ticket: { glifo: '→', etiqueta: 'Cambio de estado' },
  seguimiento: { glifo: '→', etiqueta: 'Seguimiento' },
  resumen_diario: { glifo: '→', etiqueta: 'Resumen diario' },
};

function IconoTelegram({ estado }: { estado: AvisoDatos['telegram'] }) {
  if (estado !== 'enviado' && estado !== 'fallido') return null;
  const texto = estado === 'enviado' ? 'Enviado por Telegram' : 'No se pudo enviar por Telegram';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={texto} className="shrink-0 text-tinta-3">
          <Send size={14} strokeWidth={1.5} aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{texto}</TooltipContent>
    </Tooltip>
  );
}

export function ListaAvisos({
  avisos,
  alPulsar,
}: {
  avisos: AvisoDatos[];
  alPulsar: (aviso: AvisoDatos) => void;
}) {
  return (
    <TooltipProvider>
      <ul className="divide-y divide-borde overflow-hidden rounded-lg border border-borde bg-superficie">
        {avisos.map((a) => {
          const { glifo, etiqueta } = GLIFOS[a.evento];
          return (
            <li key={a.id}>
              <Link
                to={a.enlace}
                onClick={() => alPulsar(a)}
                className={cn(
                  'flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-superficie-suave',
                  !a.leido && 'bg-[#f7f8fe]',
                )}
              >
                <span
                  role="img"
                  aria-label={etiqueta}
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-superficie-suave font-mono text-sm font-semibold text-tinta-2"
                >
                  {glifo}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn('text-sm', !a.leido && 'font-medium')}>{a.texto}</span>
                  <span className="text-xs text-tinta-3">
                    <FechaRelativa fecha={a.creado_en} />
                  </span>
                </span>
                <IconoTelegram estado={a.telegram} />
                {a.leido ? null : (
                  <span
                    role="img"
                    aria-label="Sin leer"
                    className="mt-2 size-2 shrink-0 rounded-full bg-acento"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </TooltipProvider>
  );
}
