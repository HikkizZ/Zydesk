// Datos de marca que reciben los exportadores de documentos (spec fase 4 §7): sin acceso a BD.
export interface MarcaDocumento {
  nombre_app: string;
  logo?: { tipo_mime: string; datos: Buffer };
}
