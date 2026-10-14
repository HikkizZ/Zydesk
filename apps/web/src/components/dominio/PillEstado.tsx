import {
  ETIQUETA_ESPERA_DE,
  ETIQUETA_ESTADO_TICKET,
  type EsperaDe,
  type EstadoTicket,
} from '@zydesk/shared';
import { Estado, type TonoEstado } from '@/components/dominio/Estado';

const TONO_ESTADO: Record<EstadoTicket, TonoEstado> = {
  nuevo: 'nuevo',
  en_curso: 'en-curso',
  en_espera: 'en-espera',
  resuelto: 'resuelto',
  descartado: 'cerrado',
  duplicado: 'cerrado',
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
    <Estado tono={TONO_ESTADO[estado]}>
      {estado === 'descartado' ? <span className="line-through">{etiqueta}</span> : etiqueta}
    </Estado>
  );
}
