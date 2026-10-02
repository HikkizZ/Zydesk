import type {
  DiaLineaTiempoDatos,
  ItemLineaTiempoDatos,
  LineaTiempoDatos,
  UsuarioBreveDatos,
} from '@/features/tickets/api';

// Las 10 personas del diseño "Línea de tiempo del equipo".
export const PERSONAS_LINEA: UsuarioBreveDatos[] = [
  { id: 2, nombre: 'Camila Rojas', iniciales: 'CR', color_avatar: '#F2D7C9' },
  { id: 1, nombre: 'Diego Muñoz', iniciales: 'DM', color_avatar: '#CFDDF3' },
  { id: 4, nombre: 'Valentina Soto', iniciales: 'VS', color_avatar: '#D9EBD3' },
  { id: 5, nombre: 'Matías Fuentes', iniciales: 'MF', color_avatar: '#EBDDF3' },
  { id: 6, nombre: 'Javiera Pérez', iniciales: 'JP', color_avatar: '#F3E7C4' },
  { id: 3, nombre: 'Sebastián Díaz', iniciales: 'SD', color_avatar: '#CDEBE6' },
  { id: 7, nombre: 'Fernanda Castro', iniciales: 'FC', color_avatar: '#F3CFD9' },
  { id: 8, nombre: 'Tomás Reyes', iniciales: 'TR', color_avatar: '#DAD6CF' },
  { id: 9, nombre: 'Ignacia Morales', iniciales: 'IM', color_avatar: '#D3E0F0' },
  { id: 10, nombre: 'Nicolás Vega', iniciales: 'NV', color_avatar: '#E6E2C8' },
];

const persona = (id: number) => PERSONAS_LINEA.find((p) => p.id === id)!;

// Días corridos desde `desde` (lunes) con fines de semana no hábiles; `hoy` marca el día de hoy.
export function diasDePrueba(desde: string, cantidad: number, hoy: string): DiaLineaTiempoDatos[] {
  return Array.from({ length: cantidad }, (_, i) => {
    const d = new Date(Date.parse(`${desde}T00:00:00Z`) + i * 86_400_000);
    const fecha = d.toISOString().slice(0, 10);
    const dia = d.getUTCDay();
    return { fecha, habil: dia !== 0 && dia !== 6, feriado: null, hoy: fecha === hoy };
  });
}

export function itemDePrueba(cambios: Partial<ItemLineaTiempoDatos> = {}): ItemLineaTiempoDatos {
  const responsable_id = cambios.responsable_id === undefined ? 3 : cambios.responsable_id;
  return {
    id: 7,
    codigo: 'TK-1048',
    asunto: 'Error al emitir facturas desde el ERP',
    estado: 'en_curso',
    prioridad: 'alta',
    inicio: '2026-09-28',
    limite: '2026-09-30',
    vencido: false,
    cerrado: false,
    responsable_id,
    responsables: responsable_id === null ? [] : [{ ...persona(responsable_id), principal: true }],
    cliente: { id: 1, nombre: 'Viña Santa Clara', es_interno: false },
    ot_vinculada: null,
    actualizado_en: '2026-09-29T15:00:00.000Z',
    ...cambios,
  };
}

// Semana del diseño: hoy es martes 29 sep; 2 vencidos; un ticket sin fecha límite; Camila con dos
// barras solapadas.
export function lineaDePrueba(cambios: Partial<LineaTiempoDatos> = {}): LineaTiempoDatos {
  const items = [
    itemDePrueba({
      id: 7,
      codigo: 'TK-1048',
      responsable_id: 2,
      inicio: '2026-09-28',
      limite: '2026-09-30',
      ot_vinculada: { id: 21, codigo: 'OT-0218', tipo: 'facturable' },
    }),
    itemDePrueba({
      id: 8,
      codigo: 'TK-1042',
      asunto: 'Migración de correo',
      responsable_id: 2,
      inicio: '2026-09-28',
      limite: '2026-10-02',
      cliente: { id: 2, nombre: 'Constructora Andes', es_interno: false },
    }),
    itemDePrueba({
      id: 9,
      codigo: 'TK-1031',
      asunto: 'Impresora de gerencia',
      responsable_id: 1,
      estado: 'en_espera',
      prioridad: 'urgente',
      inicio: '2026-09-24',
      limite: '2026-09-25',
      vencido: true,
      cliente: { id: 2, nombre: 'Constructora Andes', es_interno: false },
    }),
    itemDePrueba({
      id: 10,
      codigo: 'TK-1036',
      asunto: 'Respaldo semanal falla',
      responsable_id: 4,
      prioridad: 'media',
      inicio: '2026-09-25',
      limite: '2026-09-28',
      vencido: true,
      cliente: null,
    }),
    itemDePrueba({
      id: 11,
      codigo: 'TK-1060',
      asunto: 'Alta de usuario',
      responsable_id: 5,
      estado: 'nuevo',
      prioridad: 'baja',
      inicio: '2026-09-30',
      limite: null,
      cliente: { id: 1, nombre: 'Viña Santa Clara', es_interno: false },
    }),
    itemDePrueba({
      id: 12,
      codigo: 'TK-1024',
      asunto: 'Portal proveedores',
      responsable_id: null,
      estado: 'resuelto',
      inicio: '2026-09-28',
      limite: '2026-09-28',
    }),
  ];
  return {
    dias: diasDePrueba('2026-09-28', 21, '2026-09-29'),
    items,
    vencidos: 2,
    personas: PERSONAS_LINEA,
    ...cambios,
  };
}
