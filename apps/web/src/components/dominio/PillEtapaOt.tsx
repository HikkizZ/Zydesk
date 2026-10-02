import { ETIQUETA_ETAPA_OT, type EtapaOt } from '@zydesk/shared';
import { Pill, type TonoPill } from '@/components/dominio/Pill';

const TONO_ETAPA: Record<EtapaOt, TonoPill> = {
  borrador: 'neutro',
  cotizada: 'acento',
  aprobada: 'resuelto',
  en_ejecucion: 'acento',
  cerrada: 'neutro',
  cancelada: 'neutro',
};

// `etiqueta` permite una etiqueta derivada ("Esperando aprobación"); el color sigue el de la etapa real.
export function PillEtapaOt({ etapa, etiqueta }: { etapa: EtapaOt; etiqueta?: string }) {
  const texto = etiqueta ?? ETIQUETA_ETAPA_OT[etapa];
  return (
    <Pill tono={TONO_ETAPA[etapa]}>
      {etapa === 'cancelada' ? <span className="line-through">{texto}</span> : texto}
    </Pill>
  );
}
