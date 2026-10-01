import { toast } from 'sonner';
import { ErrorApi } from '@/lib/api';

// 409 de la máquina de la OT: la pantalla quedó desactualizada (alguien más actuó primero).
const CODIGOS_DESACTUALIZADO = ['TRANSICION_INVALIDA', 'OT_CERRADA', 'OT_TIPO_BLOQUEADO'];

export const mensajeDeOt = (err: unknown) =>
  err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.';

export const esDesactualizada = (err: unknown) =>
  err instanceof ErrorApi && CODIGOS_DESACTUALIZADO.includes(err.codigo);

// Toast con el mensaje de la API y refetch cuando la pantalla estaba desactualizada (spec §10.4).
export function avisarErrorOt(err: unknown, refrescar: () => unknown) {
  toast.error(mensajeDeOt(err));
  if (esDesactualizada(err)) void refrescar();
}
