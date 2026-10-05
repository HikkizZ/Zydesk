import type { ReporteSalidaDatos } from '@/features/reportes/api';

const persona = (id: number, nombre: string, iniciales: string) => ({
  id,
  nombre,
  iniciales,
  color_avatar: '#CFDDF3',
});

export const SOPORTE_TI = { id: 3, nombre: 'Soporte TI' };
export const COORDINACION = { id: 4, nombre: 'Coordinación' };

// Salida de `GET /api/reportes?desde=2026-09-28&hasta=2026-10-04` con el escenario de fábricas de la
// spec fase 7 §10.2 (cifras exactas).
export function reporteDePrueba(cambios: Partial<ReporteSalidaDatos> = {}): ReporteSalidaDatos {
  return {
    filtros: {
      desde: '2026-09-28',
      hasta: '2026-10-04',
      departamento: null,
      cliente: null,
      usuario: null,
    },
    indicadores: {
      cerrados: { total: 6, resueltos: 4, descartados: 1, duplicados: 1 },
      resolucion: { promedio_dias: 1.5, n: 4, sin_calendario: 0 },
      dentro_de_plazo: { pct: 75, dentro: 3, n: 4 },
      horas: { total: 10, facturables: 5, internas: 5, fuera_de_horario: 2, pct_facturables: 50 },
    },
    horas_por_semana: [{ semana: '2026-09-28', facturables: 5, internas: 5 }],
    carga: [
      {
        usuario: persona(11, 'Camila Rojas', 'CR'),
        departamento: SOPORTE_TI,
        tickets_abiertos: 2,
        horas_estimadas: 10,
        capacidad_semanal: 32.8,
        pct: 30,
      },
      {
        usuario: persona(12, 'Diego Muñoz', 'DM'),
        departamento: SOPORTE_TI,
        tickets_abiertos: 2,
        horas_estimadas: 4,
        capacidad_semanal: 32.8,
        pct: 12,
      },
      {
        usuario: persona(13, 'Nicolás Vega', 'NV'),
        departamento: SOPORTE_TI,
        tickets_abiertos: 0,
        horas_estimadas: 0,
        capacidad_semanal: 32.8,
        pct: 0,
      },
      {
        usuario: persona(14, 'Valentina Soto', 'VS'),
        departamento: COORDINACION,
        tickets_abiertos: 0,
        horas_estimadas: 0,
        capacidad_semanal: 19.5,
        pct: 0,
      },
    ],
    resolucion_por_prioridad: [
      { prioridad: 'urgente', n: 1, promedio_dias: 1, objetivo_dias: 1, sobre_plazo: false },
      { prioridad: 'alta', n: 1, promedio_dias: 2, objetivo_dias: 1, sobre_plazo: true },
      { prioridad: 'media', n: 1, promedio_dias: 1, objetivo_dias: 2, sobre_plazo: false },
      { prioridad: 'baja', n: 1, promedio_dias: 2, objetivo_dias: 3, sobre_plazo: false },
    ],
    por_cliente: [
      {
        cliente: { id: 21, nombre: 'Clínica Los Robles', es_interno: false },
        nombre: 'Clínica Los Robles',
        interno: false,
        abiertos: 1,
        cerrados: 2,
        horas: 0.5,
        facturado: 250000,
        por_facturar: 0,
      },
      {
        cliente: { id: 22, nombre: 'Transportes Austral', es_interno: false },
        nombre: 'Transportes Austral',
        interno: false,
        abiertos: 0,
        cerrados: 2,
        horas: 0,
        facturado: 0,
        por_facturar: 0,
      },
      {
        cliente: { id: 23, nombre: 'Viña', es_interno: false },
        nombre: 'Viña',
        interno: false,
        abiertos: 1,
        cerrados: 2,
        horas: 6.5,
        facturado: 0,
        por_facturar: 680000,
      },
      {
        cliente: null,
        nombre: 'Interno',
        interno: true,
        abiertos: 1,
        cerrados: 0,
        horas: 2,
        facturado: null,
        por_facturar: null,
      },
    ],
    ...cambios,
  };
}
