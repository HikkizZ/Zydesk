export const TIPOS_OT = ['facturable', 'interna'] as const;
export type TipoOt = (typeof TIPOS_OT)[number];

export const ETIQUETA_TIPO_OT: Record<TipoOt, string> = {
  facturable: 'Facturable · externa',
  interna: 'Interna · no facturable',
};

export const ETAPAS_OT = [
  'borrador',
  'cotizada',
  'aprobada',
  'en_ejecucion',
  'cerrada',
  'cancelada',
] as const;
export type EtapaOt = (typeof ETAPAS_OT)[number];

export const ETAPAS_OT_FINALES = ['cerrada', 'cancelada'] as const;

export const ETIQUETA_ETAPA_OT: Record<EtapaOt, string> = {
  borrador: 'Borrador',
  cotizada: 'Cotizada',
  aprobada: 'Aprobada',
  en_ejecucion: 'En ejecución',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
};

export const ESTADOS_FACTURACION = ['no_aplica', 'pendiente', 'por_facturar', 'facturada'] as const;
export type EstadoFacturacion = (typeof ESTADOS_FACTURACION)[number];

export const ETIQUETA_ESTADO_FACTURACION: Record<EstadoFacturacion, string> = {
  no_aplica: 'No aplica',
  pendiente: 'Pendiente',
  por_facturar: 'Por facturar',
  facturada: 'Facturada',
};

export const FORMAS_APROBACION = ['orden_de_compra', 'correo', 'cotizacion_firmada'] as const;
export type FormaAprobacion = (typeof FORMAS_APROBACION)[number];

export const ETIQUETA_FORMA_APROBACION: Record<FormaAprobacion, string> = {
  orden_de_compra: 'Orden de compra',
  correo: 'Correo de aprobación',
  cotizacion_firmada: 'Cotización firmada',
};

export const TIPOS_TICKET = ['ticket', 'ot_facturable', 'ot_interna'] as const;
export type TipoTicket = (typeof TIPOS_TICKET)[number];
