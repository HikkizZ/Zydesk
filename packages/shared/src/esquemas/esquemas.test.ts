import { describe, expect, it } from 'vitest';
import { CambiarContrasenaEntrada, politicaContrasena } from './auth.js';
import {
  ContratoBolsaEntrada,
  ContratoBolsaEditarEntrada,
  TarifaClienteEntrada,
  rut,
} from './cliente.js';
import { DepartamentoEntrada, HorarioDiaEsquema } from './departamento.js';
import { IngresoEntrada } from './auth.js';
import { OtCrearEntrada, OtEditarEntrada, OtResumen, OtsQuery } from './ot.js';
import { ReporteSalida, ReportesQuery } from './reportes.js';
import { TareaEntrada } from './tarea.js';
import { MensajeEntrada } from './mensaje.js';
import { CambioEtapaOt, CierreOt } from '../estados/ot.js';
import { CotizacionEntrada, CotizacionSalida, ImportarHorasEntrada } from './cotizacion.js';
import { PlantillaLineaEntrada, TarifaMonto, TarifasEntrada } from './configuracion.js';
import { IndicadorUfSalida } from './indicadores.js';

describe('rut', () => {
  it.each([
    ['76.123.465-K', '76123465-K'],
    ['76123465-k', '76123465-K'],
    ['12.345.678-5', '12345678-5'],
    ['11111111-1', '11111111-1'],
  ])('%s es válido y se normaliza', (entrada, esperado) => {
    expect(rut.parse(entrada)).toBe(esperado);
  });

  it.each(['12345678-0', '76123456-1', '76123456-K', 'abc', '', '1-9-9'])(
    '%s es inválido',
    (entrada) => {
      expect(rut.safeParse(entrada).success).toBe(false);
    },
  );
});

describe('HorarioDia', () => {
  const base = {
    dia_semana: 1,
    activo: true,
    entrada: '08:30',
    salida: '18:00',
    colacion_inicio: '13:00',
    colacion_min: 60,
  };

  it('acepta un horario coherente', () => {
    expect(HorarioDiaEsquema.safeParse(base).success).toBe(true);
  });

  it('rechaza colación fuera de rango', () => {
    expect(HorarioDiaEsquema.safeParse({ ...base, colacion_inicio: '08:00' }).success).toBe(false);
    expect(HorarioDiaEsquema.safeParse({ ...base, colacion_inicio: '17:30' }).success).toBe(false);
    expect(HorarioDiaEsquema.safeParse({ ...base, salida: '08:00', colacion_min: 0 }).success).toBe(
      false,
    );
  });

  it('con colación 0 basta entrada < salida; inactivo no se valida', () => {
    expect(
      HorarioDiaEsquema.safeParse({ ...base, colacion_min: 0, colacion_inicio: '07:00' }).success,
    ).toBe(true);
    expect(
      HorarioDiaEsquema.safeParse({ ...base, activo: false, entrada: '20:00', salida: '08:00' })
        .success,
    ).toBe(true);
  });

  it('DepartamentoEntrada exige 7 días sin repetir', () => {
    const horario = Array.from({ length: 7 }, (_, i) => ({ ...base, dia_semana: i }));
    const dep = { nombre: 'X', hora_extendida_desde: '19:00', capacidad_tickets_pct: 80, horario };
    expect(DepartamentoEntrada.safeParse(dep).success).toBe(true);
    expect(DepartamentoEntrada.safeParse({ ...dep, horario: horario.slice(1) }).success).toBe(
      false,
    );
    const repetido = horario.map((h, i) => (i === 6 ? { ...h, dia_semana: 0 } : h));
    expect(DepartamentoEntrada.safeParse({ ...dep, horario: repetido }).success).toBe(false);
  });
});

describe('politicaContrasena', () => {
  it('rechaza corta', () => {
    expect(politicaContrasena('abc123XYZ', 'a@b.cl')).toEqual({ ok: false, motivo: 'corta' });
  });
  it('rechaza igual al correo o a su parte local', () => {
    expect(politicaContrasena('Usuario.Largo@x.cl', 'usuario.largo@x.cl')).toEqual({
      ok: false,
      motivo: 'igual_correo',
    });
    expect(politicaContrasena('USUARIO.LARGO', 'usuario.largo@x.cl')).toEqual({
      ok: false,
      motivo: 'igual_correo',
    });
  });
  it('rechaza comunes', () => {
    expect(politicaContrasena('Password123', 'a@b.cl')).toEqual({ ok: false, motivo: 'comun' });
  });
  it('acepta una buena', () => {
    expect(politicaContrasena('Contrasena.Prueba.1', 'a@b.cl')).toEqual({ ok: true });
  });
});

describe('otros esquemas', () => {
  it('IngresoEntrada normaliza el correo y mantener=false por defecto', () => {
    expect(IngresoEntrada.parse({ correo: '  HIKKI@Zydesk.local ', contrasena: 'x' })).toEqual({
      correo: 'hikki@zydesk.local',
      contrasena: 'x',
      mantener: false,
    });
  });
  it('CambiarContrasenaEntrada exige nueva distinta de actual', () => {
    expect(CambiarContrasenaEntrada.safeParse({ actual: 'a', nueva: 'a' }).success).toBe(false);
    expect(CambiarContrasenaEntrada.safeParse({ actual: 'a', nueva: 'b' }).success).toBe(true);
  });
  it('ContratoBolsa: vigente_hasta ≥ vigente_desde, múltiplos de 0.5 y parcial', () => {
    const c = {
      horas_mes: 20,
      vigente_desde: '2026-09-01',
      vigente_hasta: '2026-08-01',
      fecha_renovacion: null,
      notas: null,
    };
    expect(ContratoBolsaEntrada.safeParse(c).success).toBe(false);
    expect(ContratoBolsaEntrada.safeParse({ ...c, vigente_hasta: null }).success).toBe(true);
    expect(
      ContratoBolsaEntrada.safeParse({ ...c, vigente_hasta: null, horas_mes: 20.3 }).success,
    ).toBe(false);
    expect(ContratoBolsaEditarEntrada.safeParse({ horas_mes: 10 }).success).toBe(true);
  });
  it('Tarifas sin conceptos repetidos', () => {
    expect(
      TarifaClienteEntrada.safeParse([
        { concepto: 'hora_normal', moneda: 'CLP', valor: 1 },
        { concepto: 'hora_normal', moneda: 'CLP', valor: 2 },
      ]).success,
    ).toBe(false);
  });
});

describe('esquemas de OT (Fase 3)', () => {
  it('OtCrearEntrada aplica valores por defecto', () => {
    const r = OtCrearEntrada.parse({ tipo: 'facturable' });
    expect(r).toEqual({
      tipo: 'facturable',
      alcance: null,
      responsable_tecnico_id: null,
      descuenta_bolsa: false,
    });
    expect(OtCrearEntrada.safeParse({ tipo: 'otro' }).success).toBe(false);
  });

  it('OtEditarEntrada rechaza término anterior a inicio', () => {
    const con = (inicio: string | null, termino: string | null) =>
      OtEditarEntrada.safeParse({ inicio, termino }).success;
    expect(con('2026-10-10', '2026-10-09')).toBe(false);
    expect(con('2026-10-10', '2026-10-10')).toBe(true);
    expect(con(null, '2026-10-09')).toBe(true);
    expect(OtEditarEntrada.safeParse({}).success).toBe(true);
  });

  it('CierreOt exige siguiente si no resolvió', () => {
    expect(CierreOt.safeParse({ resolvio_ticket: false, resumen: 'x' }).success).toBe(false);
  });

  it('TareaEntrada.horas_estimadas: por defecto null, múltiplo de 0.25', () => {
    expect(TareaEntrada.parse({ titulo: 'a' }).horas_estimadas).toBeNull();
    expect(TareaEntrada.safeParse({ titulo: 'a', horas_estimadas: 2.25 }).success).toBe(true);
    expect(TareaEntrada.safeParse({ titulo: 'a', horas_estimadas: 2.3 }).success).toBe(false);
    expect(TareaEntrada.safeParse({ titulo: 'a', horas_estimadas: -1 }).success).toBe(false);
  });

  it('MensajeEntrada.copiar_al_ticket es false por defecto', () => {
    expect(MensajeEntrada.parse({ tipo: 'seguimiento', texto: 'hola' }).copiar_al_ticket).toBe(
      false,
    );
  });

  it('OtsQuery: valores por defecto y csv', () => {
    const q = OtsQuery.parse({ etapa: 'borrador,aprobada', abiertas: 'true' });
    expect(q.etapa).toEqual(['borrador', 'aprobada']);
    expect(q.orden).toBe('-actualizado_en');
    expect(OtsQuery.safeParse({ etapa: 'facturada' }).success).toBe(false);
  });
});

describe('CotizacionEntrada', () => {
  const linea = {
    tipo: 'mano_de_obra',
    descripcion: 'Horas de soporte',
    cantidad: 3,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
  };
  const base = {
    contacto_id: null,
    fecha_emision: '2026-09-29',
    validez_dias: 30,
    moneda: 'CLP',
    valor_uf: null,
    aplica_iva: true,
    condiciones: null,
    nota_interna: null,
    lineas: [linea],
  };

  it('acepta una cotización válida', () => {
    expect(CotizacionEntrada.safeParse(base).success).toBe(true);
  });

  it('rechaza UF sin valor_uf', () => {
    expect(CotizacionEntrada.safeParse({ ...base, moneda: 'UF' }).success).toBe(false);
    expect(CotizacionEntrada.safeParse({ ...base, moneda: 'UF', valor_uf: 38000.5 }).success).toBe(
      true,
    );
  });

  it('rechaza cantidad 0, descuento 101, descripción vacía y 101 líneas', () => {
    const con = (cambio: object) => ({ ...base, lineas: [{ ...linea, ...cambio }] });
    expect(CotizacionEntrada.safeParse(con({ cantidad: 0 })).success).toBe(false);
    expect(CotizacionEntrada.safeParse(con({ descuento_pct: 101 })).success).toBe(false);
    expect(CotizacionEntrada.safeParse(con({ descripcion: '  ' })).success).toBe(false);
    expect(CotizacionEntrada.safeParse({ ...base, lineas: Array(101).fill(linea) }).success).toBe(
      false,
    );
  });

  it('descarta total, neto e iva_pct enviados por el cliente', () => {
    const r = CotizacionEntrada.parse({ ...base, total: 1, neto: 1, iva_pct: 5 });
    expect(r).not.toHaveProperty('total');
    expect(r).not.toHaveProperty('neto');
    expect(r).not.toHaveProperty('iva_pct');
  });
});

describe('ImportarHorasEntrada', () => {
  it('acepta estimadas, reales y registradas; por defecto estimadas; rechaza otro origen', () => {
    expect(ImportarHorasEntrada.parse({}).origen).toBe('estimadas');
    for (const origen of ['estimadas', 'reales', 'registradas']) {
      expect(ImportarHorasEntrada.parse({ origen }).origen).toBe(origen);
    }
    expect(ImportarHorasEntrada.safeParse({ origen: 'otras' }).success).toBe(false);
  });
});

describe('TarifasEntrada', () => {
  const base = {
    hora_normal: { moneda: 'CLP', valor: 38000 },
    hora_extendida: null,
    hora_urgencia: null,
    traslado_km: null,
    costo_interno: null,
    iva_pct: 19,
    validez_dias_defecto: 30,
    condiciones_defecto: null,
  };
  it('acepta tarifas con moneda o null', () => {
    expect(TarifasEntrada.safeParse(base).success).toBe(true);
    expect(
      TarifasEntrada.safeParse({ ...base, hora_normal: { moneda: 'UF', valor: 0.8 } }).success,
    ).toBe(true);
    expect(TarifasEntrada.safeParse({ ...base, costo_interno: 18000 }).success).toBe(true);
  });
  it('rechaza decimales en CLP y negativos', () => {
    const malo = (t: object) => TarifasEntrada.safeParse({ ...base, hora_normal: t }).success;
    expect(malo({ moneda: 'CLP', valor: 38000.5 })).toBe(false);
    expect(malo({ moneda: 'UF', valor: 0.123 })).toBe(false);
    expect(malo({ moneda: 'UF', valor: 100000 })).toBe(false);
    expect(malo({ moneda: 'UTM', valor: 1 })).toBe(false);
    expect(malo({ moneda: 'CLP', valor: -1 })).toBe(false);
    expect(malo({ moneda: 'UF', valor: -0.5 })).toBe(false);
  });
  it('rechaza la forma antigua y costo_interno con moneda', () => {
    expect(TarifasEntrada.safeParse({ ...base, hora_normal: 38000 }).success).toBe(false);
    expect(
      TarifasEntrada.safeParse({ ...base, costo_interno: { moneda: 'CLP', valor: 18000 } }).success,
    ).toBe(false);
  });
});

describe('TarifaMonto', () => {
  it('acepta CLP entero y UF con dos decimales', () => {
    expect(TarifaMonto.safeParse({ moneda: 'CLP', valor: 38000 }).success).toBe(true);
    expect(TarifaMonto.safeParse({ moneda: 'UF', valor: 0.8 }).success).toBe(true);
  });
});

describe('TarifaClienteEntrada (moneda)', () => {
  it('acepta moneda por concepto y rechaza costo_interno', () => {
    expect(
      TarifaClienteEntrada.safeParse([{ concepto: 'hora_normal', moneda: 'UF', valor: 0.8 }])
        .success,
    ).toBe(true);
    expect(
      TarifaClienteEntrada.safeParse([{ concepto: 'costo_interno', moneda: 'CLP', valor: 1 }])
        .success,
    ).toBe(false);
    expect(
      TarifaClienteEntrada.safeParse([{ concepto: 'hora_normal', moneda: 'UF', valor: 0.123 }])
        .success,
    ).toBe(false);
  });
});

describe('IndicadorUfSalida', () => {
  const base = {
    fecha: '2026-10-05',
    valor: 41098.15,
    fuente: 'boostr',
    obtenido_en: '2026-10-05T10:00:00.000Z',
    hoy: '2026-10-05',
    desactualizado: false,
  };
  it('acepta fuentes externas y rechaza manual', () => {
    expect(IndicadorUfSalida.safeParse(base).success).toBe(true);
    expect(IndicadorUfSalida.safeParse({ ...base, fuente: 'manual' }).success).toBe(false);
  });
});

describe('PlantillaLineaEntrada', () => {
  it('acepta precio_unitario null', () => {
    const r = PlantillaLineaEntrada.parse({
      tipo: 'servicio',
      descripcion: 'Visita',
      unidad: 'gl',
      precio_unitario: null,
    });
    expect(r.precio_unitario).toBeNull();
    expect(r.cantidad).toBe(1);
  });
});

describe('CambioEtapaOt', () => {
  it('rechaza cotizada: la marca manual desapareció', () => {
    expect(CambioEtapaOt.safeParse({ etapa: 'cotizada' }).success).toBe(false);
    expect(CambioEtapaOt.safeParse({ etapa: 'borrador' }).success).toBe(true);
  });
});

describe('ReportesQuery', () => {
  it('acepta vacío, período y coerción de ids', () => {
    expect(ReportesQuery.safeParse({}).success).toBe(true);
    expect(ReportesQuery.safeParse({ desde: '2026-09-01', hasta: '2026-09-30' }).success).toBe(
      true,
    );
    const r = ReportesQuery.safeParse({ departamento_id: '3' });
    expect(r.success && r.data.departamento_id).toBe(3);
  });

  it('acepta 366 días y rechaza 367', () => {
    expect(ReportesQuery.safeParse({ desde: '2025-01-01', hasta: '2026-01-01' }).success).toBe(
      true,
    );
    expect(ReportesQuery.safeParse({ desde: '2025-01-01', hasta: '2026-01-02' }).success).toBe(
      false,
    );
  });

  it.each([
    ['hasta anterior a desde', { desde: '2026-09-30', hasta: '2026-09-01' }],
    ['fecha mal formada', { desde: '2026-9-1' }],
    ['cliente_id no numérico', { cliente_id: 'x' }],
  ])('rechaza %s', (_caso, q) => {
    expect(ReportesQuery.safeParse(q).success).toBe(false);
  });
});

describe('ReporteSalida', () => {
  const prioridad = (p: string) => ({
    prioridad: p,
    n: 0,
    promedio_dias: null,
    objetivo_dias: null,
    sobre_plazo: false,
  });
  const base = {
    filtros: {
      desde: '2026-09-01',
      hasta: '2026-09-30',
      departamento: null,
      cliente: null,
      usuario: null,
    },
    indicadores: {
      cerrados: { total: 0, resueltos: 0, descartados: 0, duplicados: 0 },
      resolucion: { promedio_dias: null, n: 0, sin_calendario: 0 },
      dentro_de_plazo: { pct: null, dentro: 0, n: 0 },
      horas: { total: 0, facturables: 0, internas: 0, fuera_de_horario: 0, pct_facturables: null },
    },
    horas_por_semana: [{ semana: '2026-08-31', facturables: 0, internas: 0 }],
    carga: [],
    resolucion_por_prioridad: ['urgente', 'alta', 'media', 'baja'].map(prioridad),
    por_cliente: [
      {
        cliente: null,
        nombre: 'Interno',
        interno: true,
        abiertos: 0,
        cerrados: 0,
        horas: 0,
        facturado: null,
        por_facturar: null,
      },
    ],
  };

  it('acepta una salida completa', () => {
    expect(ReporteSalida.safeParse(base).success).toBe(true);
  });

  it('rechaza resolucion_por_prioridad con 3 filas', () => {
    const r = { ...base, resolucion_por_prioridad: base.resolucion_por_prioridad.slice(0, 3) };
    expect(ReporteSalida.safeParse(r).success).toBe(false);
  });
});

describe('OtResumen.neto', () => {
  it('acepta null', () => {
    expect(OtResumen.shape.neto.safeParse(null).success).toBe(true);
  });
});

describe('CotizacionSalida (procedencia de la UF)', () => {
  it('acepta fuente manual con fecha null', () => {
    const { valor_uf, valor_uf_fecha, valor_uf_fuente } = CotizacionSalida.shape;
    expect(valor_uf.safeParse(41098.15).success).toBe(true);
    expect(valor_uf_fecha.safeParse(null).success).toBe(true);
    expect(valor_uf_fuente.safeParse('manual').success).toBe(true);
    expect(valor_uf_fuente.safeParse('otra').success).toBe(false);
  });
});
