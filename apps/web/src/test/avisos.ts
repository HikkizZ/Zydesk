import type {
  AvisoDatos,
  AvisosDatos,
  PreferenciasDatos,
  TelegramEstadoDatos,
} from '@/features/avisos/api';

const CAMILA = { id: 2, nombre: 'Camila Rojas', iniciales: 'CR', color_avatar: '#F3D9CF' };

export function avisoDePrueba(cambios: Partial<AvisoDatos> = {}): AvisoDatos {
  return {
    id: 1,
    evento: 'mencion',
    tipo: 'mencion',
    texto: 'Camila Rojas te mencionó en TK-1048',
    enlace: '/tickets/1048',
    entidad: 'ticket',
    entidad_id: 1048,
    datos: {},
    actor: CAMILA,
    leido: false,
    leido_en: null,
    creado_en: '2026-10-02T12:00:00.000Z',
    telegram: null,
    ...cambios,
  };
}

// Los 8 avisos del diseño "Avisos": 3 sin leer.
export const AVISOS_DISENO: AvisoDatos[] = [
  avisoDePrueba({ id: 8 }),
  avisoDePrueba({
    id: 7,
    evento: 'asignacion',
    tipo: 'ticket_asignado',
    texto: 'Camila Rojas te asignó TK-1052 «Impresora de bodega sin conexión»',
    enlace: '/tickets/1052',
    entidad_id: 1052,
    telegram: 'enviado',
  }),
  avisoDePrueba({
    id: 6,
    evento: 'vence_pronto',
    tipo: 'vence_pronto',
    texto: 'TK-1044 «Respaldo nocturno» vence en 24 horas',
    enlace: '/tickets/1044',
    entidad_id: 1044,
    actor: null,
    telegram: 'fallido',
  }),
  avisoDePrueba({
    id: 5,
    evento: 'vencio',
    tipo: 'vencio',
    texto: 'TK-1031 «Alta de usuario» venció',
    enlace: '/tickets/1031',
    entidad_id: 1031,
    actor: null,
    leido: true,
    leido_en: '2026-10-01T14:00:00.000Z',
  }),
  avisoDePrueba({
    id: 4,
    evento: 'cotizacion',
    tipo: 'cotizacion_aprobada',
    texto: 'El cliente aprobó la cotización de OT-0218',
    enlace: '/ots/218',
    entidad: 'ot',
    entidad_id: 218,
    leido: true,
    leido_en: '2026-10-01T14:00:00.000Z',
  }),
  avisoDePrueba({
    id: 3,
    evento: 'estado_ticket',
    tipo: 'estado_ticket',
    texto: 'TK-1040 «Error de correo» pasó a Resuelto',
    enlace: '/tickets/1040',
    entidad_id: 1040,
    leido: true,
    leido_en: '2026-09-30T14:00:00.000Z',
  }),
  avisoDePrueba({
    id: 2,
    evento: 'seguimiento',
    tipo: 'seguimiento',
    texto: 'Nuevo seguimiento en TK-1037 «VPN intermitente»',
    enlace: '/tickets/1037',
    entidad_id: 1037,
    leido: true,
    leido_en: '2026-09-30T14:00:00.000Z',
  }),
  avisoDePrueba({
    id: 1,
    evento: 'por_facturar',
    tipo: 'por_facturar',
    texto: 'OT-0205 está cerrada y lista para facturar',
    enlace: '/ots/205',
    entidad: 'ot',
    entidad_id: 205,
    leido: true,
    leido_en: '2026-09-29T14:00:00.000Z',
  }),
];

export function avisosDePrueba(
  datos: AvisoDatos[] = AVISOS_DISENO,
  cambios: Partial<AvisosDatos> = {},
): AvisosDatos {
  return {
    datos,
    total: datos.length,
    pagina: 1,
    por_pagina: 30,
    no_leidos: datos.filter((a) => !a.leido).length,
    ...cambios,
  };
}

// Valores por defecto del diseño: app todo activo; Telegram salvo estado y seguimiento.
export function preferenciasDePrueba(vinculado = true): PreferenciasDatos {
  const eventos = [
    'asignacion',
    'mencion',
    'vence_pronto',
    'vencio',
    'estado_ticket',
    'seguimiento',
    'cotizacion',
    'por_facturar',
    'resumen_diario',
  ] as const;
  return {
    filas: eventos.map((evento) => ({
      evento,
      app: evento !== 'resumen_diario',
      telegram: evento !== 'estado_ticket' && evento !== 'seguimiento',
    })),
    telegram_vinculado: vinculado,
  };
}

export function telegramDePrueba(cambios: Partial<TelegramEstadoDatos> = {}): TelegramEstadoDatos {
  return {
    vinculado: false,
    telegram_usuario: null,
    vinculado_en: null,
    sesion_bot_activa: false,
    bot_usuario: 'zydesk_dev_bot',
    disponible: true,
    ...cambios,
  };
}
