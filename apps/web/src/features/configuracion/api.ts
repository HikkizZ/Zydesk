import type {
  AuditoriaSalidaDatos,
  CalcularPlazoEntradaDatos,
  CalcularPlazoSalidaDatos,
  CategoriaEntradaDatos,
  CategoriaSalidaDatos,
  DepartamentoEntradaDatos,
  DepartamentoSalidaDatos,
  EventoSalidaDatos,
  FeriadoEntradaDatos,
  FeriadoSalidaDatos,
  LogoEntradaDatos,
  MarcaEntradaDatos,
  MarcaSalidaDatos,
  NumeracionEntradaDatos,
  NumeracionSalidaDatos,
  RestablecerSalidaDatos,
  UsuarioCrearEntradaDatos,
  UsuarioEditarEntradaDatos,
  UsuarioSalidaDatos,
} from '@zydesk/shared';
import { conQuery, enviar, obtener } from '@/lib/api';

// Usuarios ---------------------------------------------------------------------------------
export interface FiltrosUsuarios {
  activo?: 'true' | 'false';
}

// `GET /api/usuarios` sin `activo` devuelve todos; por defecto la pantalla pide solo los activos.
export const usuarios = (filtros: FiltrosUsuarios) =>
  obtener<UsuarioSalidaDatos[]>(conQuery('/api/usuarios', { ...filtros }));

export const crearUsuario = (entrada: UsuarioCrearEntradaDatos) =>
  enviar<UsuarioSalidaDatos>('POST', '/api/usuarios', entrada);

export const editarUsuario = (id: number, entrada: UsuarioEditarEntradaDatos) =>
  enviar<UsuarioSalidaDatos>('PATCH', `/api/usuarios/${id}`, entrada);

export const desactivarUsuario = (id: number) =>
  enviar<UsuarioSalidaDatos>('POST', `/api/usuarios/${id}/desactivar`);

export const reactivarUsuario = (id: number) =>
  enviar<UsuarioSalidaDatos>('POST', `/api/usuarios/${id}/reactivar`);

export const restablecerContrasena = (id: number) =>
  enviar<RestablecerSalidaDatos>('POST', `/api/usuarios/${id}/restablecer-contrasena`);

// Auditoría ---------------------------------------------------------------------------------
export interface FiltrosAuditoria {
  pagina: number;
  accion?: string;
  usuario_id?: number;
  correo?: string;
  desde?: string;
  hasta?: string;
}

export interface PaginaAuditoria {
  datos: AuditoriaSalidaDatos[];
  total: number;
  pagina: number;
  por_pagina: number;
}

export const auditoria = (filtros: FiltrosAuditoria) =>
  obtener<PaginaAuditoria>(conQuery('/api/auditoria', { ...filtros, por_pagina: 50 }));

// Departamentos y feriados --------------------------------------------------------------------
export const departamentos = () => obtener<DepartamentoSalidaDatos[]>('/api/departamentos');

export const crearDepartamento = (entrada: DepartamentoEntradaDatos) =>
  enviar<DepartamentoSalidaDatos>('POST', '/api/departamentos', entrada);

export const guardarDepartamento = (id: number, entrada: DepartamentoEntradaDatos) =>
  enviar<DepartamentoSalidaDatos>('PUT', `/api/departamentos/${id}`, entrada);

export const eliminarDepartamento = (id: number) =>
  enviar<void>('DELETE', `/api/departamentos/${id}`);

export const feriados = (anio: number, departamentoId: number) =>
  obtener<FeriadoSalidaDatos[]>(
    conQuery('/api/feriados', { anio, departamento_id: departamentoId }),
  );

export const crearFeriado = (entrada: FeriadoEntradaDatos) =>
  enviar<FeriadoSalidaDatos>('POST', '/api/feriados', entrada);

export const eliminarFeriado = (id: number) => enviar<void>('DELETE', `/api/feriados/${id}`);

// Categorías ----------------------------------------------------------------------------------
export const categorias = (activo?: 'true' | 'false') =>
  obtener<CategoriaSalidaDatos[]>(conQuery('/api/categorias', { activo }));

export const crearCategoria = (entrada: CategoriaEntradaDatos) =>
  enviar<CategoriaSalidaDatos>('POST', '/api/categorias', entrada);

export const guardarCategoria = (id: number, entrada: CategoriaEntradaDatos) =>
  enviar<CategoriaSalidaDatos>('PUT', `/api/categorias/${id}`, entrada);

export const desactivarCategoria = (id: number) =>
  enviar<CategoriaSalidaDatos>('POST', `/api/categorias/${id}/desactivar`);

export const reactivarCategoria = (id: number) =>
  enviar<CategoriaSalidaDatos>('POST', `/api/categorias/${id}/reactivar`);

export const calcularPlazo = (entrada: CalcularPlazoEntradaDatos) =>
  enviar<CalcularPlazoSalidaDatos>('POST', '/api/plazos/calcular', entrada);

// Marca y numeración --------------------------------------------------------------------------
export const guardarMarca = (entrada: MarcaEntradaDatos) =>
  enviar<MarcaSalidaDatos>('PUT', '/api/config/marca', entrada);

export const subirLogo = (entrada: LogoEntradaDatos) =>
  enviar<MarcaSalidaDatos>('PUT', '/api/config/logo', entrada);

export const quitarLogo = () => enviar<MarcaSalidaDatos>('DELETE', '/api/config/logo');

export const numeracion = () => obtener<NumeracionSalidaDatos>('/api/config/numeracion');

export const guardarNumeracion = (entrada: NumeracionEntradaDatos) =>
  enviar<NumeracionSalidaDatos>('PUT', '/api/config/numeracion', entrada);

export const historialNumeracion = () =>
  obtener<EventoSalidaDatos[]>('/api/config/numeracion/historial');
