import { ETIQUETA_PRIORIDAD, type Prioridad } from '@zydesk/shared';
import { Pill, type TonoPill } from '@/components/dominio/Pill';

const TONO_PRIORIDAD: Record<Prioridad, TonoPill> = {
  urgente: 'urgente',
  alta: 'alta',
  media: 'acento',
  baja: 'neutro',
};

export function PillPrioridad({ prioridad }: { prioridad: Prioridad }) {
  return <Pill tono={TONO_PRIORIDAD[prioridad]}>{ETIQUETA_PRIORIDAD[prioridad]}</Pill>;
}
