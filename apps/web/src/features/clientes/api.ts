import type {
  ClienteEntradaDatos,
  ClienteResumenDatos,
  ClienteSalidaDatos,
  ContactoEntradaDatos,
  ContactoSalidaDatos,
  ContratoBolsaEntradaDatos,
  ContratoBolsaSalidaDatos,
  TarifaClienteEntradaDatos,
  TarifaClienteSalidaDatos,
} from '@zydesk/shared';
import { conQuery, enviar, obtener } from '@/lib/api';

export type {
  ClienteEntradaDatos,
  ClienteResumenDatos,
  ClienteSalidaDatos,
  ContactoEntradaDatos,
  ContactoSalidaDatos,
  ContratoBolsaEntradaDatos,
  ContratoBolsaSalidaDatos,
  TarifaClienteEntradaDatos,
  TarifaClienteSalidaDatos,
};

// La API devuelve solo activos por defecto y solo inactivos con `activo=false`.
export const clientes = (activo: boolean) =>
  obtener<ClienteResumenDatos[]>(
    conQuery('/api/clientes', { activo: activo ? undefined : 'false' }),
  );

export const cliente = (id: number) => obtener<ClienteSalidaDatos>(`/api/clientes/${id}`);

export const crearCliente = (entrada: ClienteEntradaDatos) =>
  enviar<ClienteSalidaDatos>('POST', '/api/clientes', entrada);

export const editarCliente = (id: number, entrada: Partial<ClienteEntradaDatos>) =>
  enviar<ClienteSalidaDatos>('PATCH', `/api/clientes/${id}`, entrada);

export const desactivarCliente = (id: number) =>
  enviar<ClienteSalidaDatos>('POST', `/api/clientes/${id}/desactivar`);

export const reactivarCliente = (id: number) =>
  enviar<ClienteSalidaDatos>('POST', `/api/clientes/${id}/reactivar`);

export const crearContacto = (id: number, entrada: ContactoEntradaDatos) =>
  enviar<ContactoSalidaDatos>('POST', `/api/clientes/${id}/contactos`, entrada);

export const editarContacto = (id: number, contactoId: number, entrada: ContactoEntradaDatos) =>
  enviar<ContactoSalidaDatos>('PATCH', `/api/clientes/${id}/contactos/${contactoId}`, entrada);

export const quitarContacto = (id: number, contactoId: number) =>
  enviar<void>('DELETE', `/api/clientes/${id}/contactos/${contactoId}`);

export const crearBolsa = (id: number, entrada: ContratoBolsaEntradaDatos) =>
  enviar<ContratoBolsaSalidaDatos>('POST', `/api/clientes/${id}/bolsa`, entrada);

export const guardarTarifas = (id: number, entrada: TarifaClienteEntradaDatos) =>
  enviar<TarifaClienteSalidaDatos[]>('PUT', `/api/clientes/${id}/tarifas`, entrada);
