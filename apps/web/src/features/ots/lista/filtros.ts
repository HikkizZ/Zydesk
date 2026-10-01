import type { ConsultaOts } from '@/features/ots/api';

export type ClaveChipOt = 'todas' | 'abiertas' | 'por_facturar' | 'facturadas' | 'internas';

// Cada chip activo es un parámetro de la URL con el mismo nombre y valor que el de la API.
export const CHIPS_OT: {
  clave: ClaveChipOt;
  etiqueta: string;
  param: 'abiertas' | 'estado_facturacion' | 'tipo' | null;
  valor: string | null;
}[] = [
  { clave: 'todas', etiqueta: 'Todas', param: null, valor: null },
  { clave: 'abiertas', etiqueta: 'Abiertas', param: 'abiertas', valor: 'true' },
  {
    clave: 'por_facturar',
    etiqueta: 'Por facturar',
    param: 'estado_facturacion',
    valor: 'por_facturar',
  },
  {
    clave: 'facturadas',
    etiqueta: 'Facturadas',
    param: 'estado_facturacion',
    valor: 'facturada',
  },
  { clave: 'internas', etiqueta: 'Internas', param: 'tipo', valor: 'interna' },
];

export const PARAMS_CHIP_OT = ['abiertas', 'estado_facturacion', 'tipo'] as const;

export function chipActivoOt(params: URLSearchParams): ClaveChipOt {
  return CHIPS_OT.find((c) => c.param && params.get(c.param) === c.valor)?.clave ?? 'todas';
}

// Parte de la consulta que aporta un chip.
export function consultaDeChipOt(clave: ClaveChipOt): ConsultaOts {
  switch (clave) {
    case 'abiertas':
      return { abiertas: true };
    case 'por_facturar':
      return { estado_facturacion: 'por_facturar' };
    case 'facturadas':
      return { estado_facturacion: 'facturada' };
    case 'internas':
      return { tipo: 'interna' };
    default:
      return {};
  }
}
