import type {
  CeldaDatos,
  DestinoDatos,
  DiaDatos,
  FilaDatos,
  PlanillaDatos,
  RegistroCeldaDatos,
} from '@/features/horas/api';

const FECHAS = [
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
  '2026-10-04',
];
const JORNADAS = [8.5, 8.5, 8.5, 8.5, 7, 0, 0];
const DIA_SEMANA = [1, 2, 3, 4, 5, 6, 0];

let siguienteId = 100;

export function registroDePrueba(
  fecha: string,
  horas: number,
  cambios: Partial<RegistroCeldaDatos> = {},
): RegistroCeldaDatos {
  return {
    id: siguienteId++,
    usuario_id: 3,
    fecha,
    ticket_id: null,
    ot_id: null,
    tarea_id: null,
    mensaje_id: null,
    descripcion: null,
    horas,
    fuera_de_horario: false,
    creado_en: '2026-09-28T13:00:00.000Z',
    actualizado_en: '2026-09-28T13:00:00.000Z',
    mensaje: null,
    ...cambios,
  };
}

export const CLIENTE = { id: 1, nombre: 'Viña Santa Clara', es_interno: false };

export const destinoOt = (
  id: number,
  codigo: string,
  titulo: string,
  cambios: Partial<Extract<DestinoDatos, { tipo: 'ot' }>> = {},
): DestinoDatos => ({
  tipo: 'ot',
  id,
  codigo,
  titulo,
  tipo_ot: 'facturable',
  etapa: 'en_ejecucion',
  cliente: CLIENTE,
  final: false,
  ...cambios,
});

export const destinoTicket = (id: number, codigo: string, titulo: string): DestinoDatos => ({
  tipo: 'ticket',
  id,
  codigo,
  titulo,
  cliente: CLIENTE,
  cerrado: false,
});

export const destinoSinTicket = (descripcion: string): DestinoDatos => ({
  tipo: 'sin_ticket',
  descripcion,
});

export function celdaDePrueba(fecha: string, registros: RegistroCeldaDatos[]): CeldaDatos {
  return {
    fecha,
    total: registros.reduce((s, r) => s + r.horas, 0),
    fuera_de_horario: registros.some((r) => r.fuera_de_horario),
    registros,
  };
}

// Fila con una fila manual por cada día con horas > 0 (`horas` = Lun…Dom; los que faltan, 0).
export function filaDePrueba(
  clave: string,
  destino: DestinoDatos,
  horas: number[],
  cambios: Partial<FilaDatos> = {},
): FilaDatos {
  const celdas = FECHAS.map((fecha, i) => {
    const h = horas[i] ?? 0;
    const base =
      destino.tipo === 'ticket'
        ? { ticket_id: destino.id }
        : destino.tipo === 'ot'
          ? { ot_id: destino.id, tarea_id: cambios.tarea?.id ?? null }
          : { descripcion: destino.descripcion };
    return celdaDePrueba(fecha, h > 0 ? [registroDePrueba(fecha, h, base)] : []);
  });
  return {
    clave,
    destino,
    tarea: null,
    facturable: destino.tipo === 'ot' && destino.tipo_ot === 'facturable',
    celdas,
    total: celdas.reduce((s, c) => s + c.total, 0),
    ...cambios,
  };
}

// Las cinco filas del diseño "Registro de horas" (lunes y martes).
export const FILAS_DISENO: FilaDatos[] = [
  filaDePrueba(
    'ot:21',
    destinoOt(21, 'OT-0218', 'Regularización de folios de facturación electrónica'),
    [3, 1],
  ),
  filaDePrueba('ot:20', destinoOt(20, 'OT-0217', 'Migración de correo a nuevo dominio'), [2, 2.5]),
  filaDePrueba(
    'ticket:26',
    destinoTicket(26, 'TK-1026', 'Impresora del piso 3 atasca papel'),
    [1.5, 0],
  ),
  filaDePrueba(
    'ticket:49',
    destinoTicket(49, 'TK-1049', 'Alta de usuario para nueva contadora'),
    [0, 0.5],
  ),
  filaDePrueba(
    'sin_ticket:Reunión de equipo y coordinación',
    destinoSinTicket('Reunión de equipo y coordinación'),
    [1, 0.5],
  ),
];

// Planilla de Sebastián Díaz en la semana del 28 sep; hoy es el martes 29 (columnas siguientes futuras).
export function planillaDePrueba(
  cambios: Partial<PlanillaDatos> & { filas?: FilaDatos[]; indiceHoy?: number } = {},
): PlanillaDatos {
  const { indiceHoy = 1, filas = FILAS_DISENO, ...resto } = cambios;
  const dias: DiaDatos[] = FECHAS.map((fecha, i) => ({
    fecha,
    dia_semana: DIA_SEMANA[i] ?? 0,
    jornada: JORNADAS[i] ?? 0,
    feriado: null,
    hoy: i === indiceHoy,
    futuro: i > indiceHoy,
    total: filas.reduce((s, f) => s + (f.celdas[i]?.total ?? 0), 0),
  }));
  const semana = filas.reduce((s, f) => s + f.total, 0);
  const facturables = filas.filter((f) => f.facturable).reduce((s, f) => s + f.total, 0);
  return {
    usuario: {
      id: 3,
      nombre: 'Sebastián Díaz',
      iniciales: 'SD',
      color_avatar: '#CDEBE6',
      departamento: { id: 1, nombre: 'Soporte TI' },
      activo: true,
    },
    semana: {
      desde: '2026-09-28',
      hasta: '2026-10-04',
      anterior: '2026-09-21',
      siguiente: '2026-10-05',
      actual: true,
    },
    dias,
    filas,
    totales: {
      semana,
      facturables,
      internas: semana - facturables,
      fuera_de_horario: 0,
      jornada_semanal: 41,
    },
    editable: true,
    ...resto,
  };
}
