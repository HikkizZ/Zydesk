export const MONEDAS = ['CLP', 'UF'] as const;
export type Moneda = (typeof MONEDAS)[number];
export const ETIQUETA_MONEDA: Record<Moneda, string> = {
  CLP: 'Pesos chilenos (CLP)',
  UF: 'Unidades de fomento (UF)',
};

export const TIPOS_LINEA = ['mano_de_obra', 'material', 'servicio', 'traslado'] as const;
export type TipoLinea = (typeof TIPOS_LINEA)[number];
export const ETIQUETA_TIPO_LINEA: Record<TipoLinea, string> = {
  mano_de_obra: 'Mano de obra',
  material: 'Material',
  servicio: 'Servicio',
  traslado: 'Traslado',
};

export const UNIDADES = ['h', 'un', 'km', 'gl'] as const;
export type Unidad = (typeof UNIDADES)[number];
export const ETIQUETA_UNIDAD: Record<Unidad, string> = { h: 'h', un: 'un', km: 'km', gl: 'gl' };

export const VALIDEZ_DIAS = [15, 30] as const;
export type ValidezDias = (typeof VALIDEZ_DIAS)[number];

export const ESTADOS_COTIZACION = [
  'borrador',
  'enviada',
  'aprobada',
  'rechazada',
  'reemplazada',
] as const;
export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number];
export const ETIQUETA_ESTADO_COTIZACION: Record<EstadoCotizacion, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  reemplazada: 'Reemplazada',
};
