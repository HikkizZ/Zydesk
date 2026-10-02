// Canales externos de avisos (ADR 0008). La fila `aviso` es el canal `app`; `correo` no se implementa
// (ADR 0013). `CanalTelegram` llega con el bloque 6C.
export interface AvisoParaEnviar {
  id: number;
  tipo: string;
  texto: string;
  enlace: string;
  entidad: 'ticket' | 'ot';
  entidad_id: number;
  datos: Record<string, unknown>;
}

export interface Canal {
  nombre: 'telegram' | 'correo';
  enviar(aviso: AvisoParaEnviar, destino: { chat_id: number }): Promise<void>;
}
