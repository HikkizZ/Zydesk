import { AsyncLocalStorage } from 'node:async_hooks';

export interface ContextoPeticion {
  req_id: string;
  usuario_id?: number;
  ip?: string;
  sesion_id?: string;
}

export const contexto = new AsyncLocalStorage<ContextoPeticion>();
