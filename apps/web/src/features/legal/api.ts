import type { DocumentoLegalSalidaDatos } from '@zydesk/shared';
import { obtener } from '@/lib/api';

export type { DocumentoLegalSalidaDatos };

export const documentoLegal = (clave: DocumentoLegalSalidaDatos['clave']) =>
  obtener<DocumentoLegalSalidaDatos>(`/api/legal/${clave}`);
