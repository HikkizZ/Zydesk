import { esCerrado, type EstadoTicket } from '@zydesk/shared';

export type ClaveColumna = 'nuevo' | 'en_curso' | 'en_espera' | 'cerrados';

export const COLUMNAS: {
  clave: ClaveColumna;
  titulo: string;
  subtitulo?: string;
  punto: string;
}[] = [
  { clave: 'nuevo', titulo: 'Nuevo', punto: 'bg-estado-nuevo' },
  { clave: 'en_curso', titulo: 'En curso', punto: 'bg-acento' },
  { clave: 'en_espera', titulo: 'En espera', punto: 'bg-plazo-atento' },
  {
    clave: 'cerrados',
    titulo: 'Cerrados',
    subtitulo: 'Se archivan a los 7 días',
    punto: 'bg-plazo-ok',
  },
];

// Los tres estados cerrados comparten la columna "Cerrados".
export const columnaDe = (estado: EstadoTicket): ClaveColumna =>
  esCerrado(estado) ? 'cerrados' : (estado as Exclude<ClaveColumna, 'cerrados'>);
