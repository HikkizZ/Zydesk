import {
  ETIQUETA_ESPERA_DE,
  ETIQUETA_ESTADO_TICKET,
  type EsperaDe,
  type EstadoTicket,
} from '@zydesk/shared';
import { Pill, type TonoPill } from '@/components/dominio/Pill';

const TONO_ESTADO: Record<EstadoTicket, TonoPill> = {
  nuevo: 'neutro',
  en_curso: 'acento',
  en_espera: 'en-espera',
  resuelto: 'resuelto',
  descartado: 'neutro',
  duplicado: 'neutro',
};

export function PillEstado({
  estado,
  espera_de,
}: {
  estado: EstadoTicket;
  espera_de?: EsperaDe | null | undefined;
}) {
  const etiqueta =
    estado === 'en_espera' && espera_de
      ? `${ETIQUETA_ESTADO_TICKET[estado]} · ${ETIQUETA_ESPERA_DE[espera_de]}`
      : ETIQUETA_ESTADO_TICKET[estado];
  return (
    <Pill tono={TONO_ESTADO[estado]}>
      {estado === 'descartado' ? <span className="line-through">{etiqueta}</span> : etiqueta}
    </Pill>
  );
}
