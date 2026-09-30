import type { UsuarioSalidaDatos } from '@zydesk/shared';
import type { TicketDatos } from '@/features/tickets/api';

export const USUARIOS_PRUEBA: UsuarioSalidaDatos[] = [
  usuario(1, 'Diego Muñoz', 'DM', 'tecnico', 'Terreno'),
  usuario(2, 'Camila Rojas', 'CR', 'coordinacion', 'Soporte TI'),
  usuario(3, 'Sebastián Díaz', 'SD', 'tecnico', 'Soporte TI'),
];

function usuario(
  id: number,
  nombre: string,
  iniciales: string,
  rol: UsuarioSalidaDatos['rol'],
  departamento: string,
): UsuarioSalidaDatos {
  return {
    id,
    nombre,
    correo: `u${id}@zydesk.local`,
    rol,
    departamento_id: id,
    departamento: { id, nombre: departamento },
    activo: true,
    color_avatar: '#CFDDF3',
    iniciales,
    debe_cambiar_contrasena: false,
    ultimo_ingreso: null,
    creado_en: '2026-09-01T12:00:00.000Z',
    actualizado_en: '2026-09-01T12:00:00.000Z',
  };
}

export function ticketDePrueba(cambios: Partial<TicketDatos> = {}): TicketDatos {
  return {
    id: 7,
    numero: 1048,
    codigo: 'TK-1048',
    asunto: 'Error al emitir facturas desde el ERP',
    descripcion: 'No deja emitir facturas.',
    cliente: { id: 1, nombre: 'Viña Santa Clara', es_interno: false },
    cliente_id: 1,
    solicitante_nombre: 'Paula Herrera',
    solicitante_correo: 'pherrera@ejemplo.test',
    origen: 'externo',
    estado: 'en_curso',
    espera_de: null,
    espera_detalle: null,
    prioridad: 'alta',
    categoria: { id: 1, nombre: 'ERP / Facturación' },
    categoria_id: 1,
    responsables: [
      {
        id: 3,
        nombre: 'Sebastián Díaz',
        iniciales: 'SD',
        color_avatar: '#CDEBE6',
        principal: true,
      },
      { id: 2, nombre: 'Camila Rojas', iniciales: 'CR', color_avatar: '#F2D7C9', principal: false },
    ],
    seguidores: [],
    fecha_limite: '2026-09-30T20:00:00.000Z',
    inicio_planificado: null,
    horas_estimadas: 3.5,
    respuesta_limite: null,
    primera_respuesta_en: '2026-09-28T20:05:00.000Z',
    vencido: false,
    vence_hoy: false,
    tiene_correo: false,
    n_mensajes: 0,
    motivo_cierre: null,
    duplicado_de: null,
    tipo: 'ticket',
    ot_vinculada: null,
    ots: [],
    correo: null,
    archivos: [],
    tareas: [],
    creado_por: { id: 2, nombre: 'Camila Rojas' },
    creado_en: '2026-09-28T19:58:00.000Z',
    actualizado_en: '2026-09-29T12:00:00.000Z',
    cerrado_en: null,
    archivado_en: null,
    ...cambios,
  };
}
