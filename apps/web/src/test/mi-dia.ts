import type { MiDiaDatos } from '@/features/mi-dia/api';
import type { TicketResumenDatos } from '@/features/tickets/api';

const SD = { id: 3, nombre: 'Sebastián Díaz', iniciales: 'SD', color_avatar: '#CDEBE6' };
const CR = { id: 2, nombre: 'Camila Rojas', iniciales: 'CR', color_avatar: '#F2D7C9' };

export function ticketResumenDePrueba(
  cambios: Partial<TicketResumenDatos> = {},
): TicketResumenDatos {
  return {
    id: 7,
    numero: 1048,
    codigo: 'TK-1048',
    asunto: 'Error al emitir facturas desde el ERP',
    cliente: { id: 1, nombre: 'Viña Santa Clara', es_interno: false },
    estado: 'en_curso',
    espera_de: null,
    espera_detalle: null,
    prioridad: 'alta',
    responsables: [{ ...SD, principal: true }],
    fecha_limite: '2026-10-01T20:00:00.000Z',
    inicio_planificado: null,
    vencido: false,
    vence_hoy: true,
    tiene_correo: false,
    n_mensajes: 2,
    motivo_cierre: null,
    duplicado_de: null,
    tipo: 'ticket',
    ot_vinculada: null,
    creado_en: '2026-09-28T13:00:00.000Z',
    actualizado_en: '2026-10-01T12:00:00.000Z',
    cerrado_en: null,
    archivado_en: null,
    ...cambios,
  };
}

function mencion(id: number, texto: string): MiDiaDatos['menciones'][number] {
  return {
    id,
    evento: 'mencion',
    tipo: 'mencion',
    texto,
    enlace: '/tickets/7',
    entidad: 'ticket',
    entidad_id: 7,
    datos: {},
    actor: CR,
    leido: false,
    leido_en: null,
    creado_en: '2026-10-01T12:30:00.000Z',
    telegram: null,
  };
}

function tarea(
  id: number,
  titulo: string,
  fecha: string | null,
  destino: MiDiaDatos['tareas'][number]['destino'],
): MiDiaDatos['tareas'][number] {
  return {
    id,
    ticket_id: destino.tipo === 'ticket' ? destino.id : null,
    ot_id: destino.tipo === 'ot' ? destino.id : null,
    titulo,
    responsable: SD,
    fecha,
    hecha: false,
    horas_estimadas: null,
    horas_reales: null,
    horas_registradas: 0,
    hecha_en: null,
    orden: id,
    vencida: false,
    creado_en: '2026-09-28T13:00:00.000Z',
    actualizado_en: '2026-09-28T13:00:00.000Z',
    destino,
  };
}

// Respuesta de ejemplo de la spec fase 6 §16: 2 vencen hoy, 1 por aprobar, 3 menciones, 3 tareas, 1 detenido.
export function miDiaDePrueba(cambios: Partial<MiDiaDatos> = {}): MiDiaDatos {
  return {
    fecha: '2026-10-01',
    vencen_hoy: [
      ticketResumenDePrueba(),
      ticketResumenDePrueba({
        id: 8,
        numero: 1051,
        codigo: 'TK-1051',
        asunto: 'Servidor de archivos no responde',
      }),
    ],
    vencidos: [],
    por_aprobar: [
      {
        id: 30,
        numero: 219,
        codigo: 'OT-0219',
        titulo: 'Reemplazo de UPS en sala de servidores',
        tipo: 'interna',
        etapa: 'borrador',
        estado_facturacion: 'no_aplica',
        resolvio_ticket: null,
        creado_en: '2026-09-30T13:00:00.000Z',
        cerrada_en: null,
        ticket: { id: 12, codigo: 'TK-1053', asunto: 'UPS' },
        cliente: null,
        responsable_tecnico: {
          id: 4,
          nombre: 'Valentina Soto',
          iniciales: 'VS',
          color_avatar: '#D9EBD3',
        },
        aprobador: { id: 5, nombre: 'Fernanda Castro', iniciales: 'FC', color_avatar: '#F3CFD9' },
        neto: null,
        horas: { estimadas: 6, reales: 0, registradas: 0 },
        inicio: null,
        termino: null,
        vencida: false,
        esperando_cliente: false,
        por_aprobar: true,
        n_mensajes: 0,
        actualizado_en: '2026-09-30T13:00:00.000Z',
      },
    ],
    menciones: [
      mencion(1, 'Camila Rojas te mencionó en una nota interna de TK-1048'),
      mencion(2, 'Tomás Reyes te mencionó en TK-1028'),
      mencion(3, 'Valentina Soto te mencionó en OT-0215'),
    ],
    tareas: [
      tarea(1, 'Responder a Camila sobre la bolsa de horas', '2026-10-01', {
        tipo: 'ticket',
        id: 7,
        codigo: 'TK-1048',
        titulo: 'Error al emitir facturas',
      }),
      tarea(2, 'Revisar la carga del equipo', '2026-10-01', {
        tipo: 'ot',
        id: 21,
        codigo: 'OT-0218',
        titulo: 'Folios',
      }),
      tarea(3, 'Firmar la orden de compra de licencias', '2026-10-02', {
        tipo: 'ticket',
        id: 9,
        codigo: 'TK-1030',
        titulo: 'Licencias',
      }),
    ],
    detenidos: [
      ticketResumenDePrueba({
        id: 10,
        numero: 1028,
        codigo: 'TK-1028',
        asunto: 'Revisión de cámaras',
        vence_hoy: false,
        fecha_limite: null,
        actualizado_en: '2026-09-26T12:00:00.000Z',
        estado: 'en_espera',
      }),
    ],
    conteos: { vencen_hoy: 2, vencidos: 0, por_aprobar: 1, menciones: 3, tareas: 3, detenidos: 1 },
    ...cambios,
  };
}
