export const ESTADOS_TICKET = [
  'nuevo',
  'en_curso',
  'en_espera',
  'resuelto',
  'descartado',
  'duplicado',
] as const;
export type EstadoTicket = (typeof ESTADOS_TICKET)[number];

export const ESTADOS_TICKET_CERRADOS = ['resuelto', 'descartado', 'duplicado'] as const;

export const ETIQUETA_ESTADO_TICKET: Record<EstadoTicket, string> = {
  nuevo: 'Nuevo',
  en_curso: 'En curso',
  en_espera: 'En espera',
  resuelto: 'Resuelto',
  descartado: 'Descartado',
  duplicado: 'Duplicado',
};

export const ESPERA_DE = ['cliente', 'proveedor', 'repuesto', 'aprobacion'] as const;
export type EsperaDe = (typeof ESPERA_DE)[number];

export const ETIQUETA_ESPERA_DE: Record<EsperaDe, string> = {
  cliente: 'cliente',
  proveedor: 'proveedor',
  repuesto: 'repuesto',
  aprobacion: 'aprobación',
};

export const ORIGENES_TICKET = ['externo', 'interno'] as const;
export type OrigenTicket = (typeof ORIGENES_TICKET)[number];

export const TIPOS_MENSAJE = ['seguimiento', 'nota_interna'] as const;
export type TipoMensaje = (typeof TIPOS_MENSAJE)[number];

export const CATEGORIAS_ARCHIVO = ['foto', 'documento', 'correo'] as const;
export type CategoriaArchivo = (typeof CATEGORIAS_ARCHIVO)[number];
