import { ETIQUETA_ETAPA_OT, type EtapaOt } from '@zydesk/shared';
import { Estado, type TonoEstado } from '@/components/dominio/Estado';

const TONO_ETAPA: Record<EtapaOt, TonoEstado> = {
  borrador: 'borrador',
  cotizada: 'cotizada',
  aprobada: 'resuelto',
  en_ejecucion: 'ejecucion',
  cerrada: 'cerrado',
  cancelada: 'cerrado',
};

// `etiqueta` permite una etiqueta derivada ("Esperando aprobación"); el tono sigue el de la etapa real.
export function PillEtapaOt({ etapa, etiqueta }: { etapa: EtapaOt; etiqueta?: string }) {
  const texto = etiqueta ?? ETIQUETA_ETAPA_OT[etapa];
  return (
    <Estado tono={TONO_ETAPA[etapa]}>
      {etapa === 'cancelada' ? <span className="line-through">{texto}</span> : texto}
    </Estado>
  );
}
