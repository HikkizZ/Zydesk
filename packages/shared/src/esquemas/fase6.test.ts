import { describe, expect, it } from 'vitest';
import { EVENTOS_AVISO, EVENTOS_POR_FILTRO } from '../enums/aviso.js';
import { PREFERENCIAS_POR_DEFECTO, resolverPreferencias } from '../avisos/preferencias.js';
import { PreferenciasEntrada } from './aviso.js';
import { BotVincularEntrada } from './bot.js';
import { LineaTiempoQuery } from './linea-tiempo.js';

describe('resolverPreferencias', () => {
  it('sin filas devuelve las 9 filas con los valores del diseño', () => {
    const r = resolverPreferencias([]);
    expect(Object.keys(r)).toHaveLength(9);
    expect(EVENTOS_AVISO.every((e) => e in r)).toBe(true);
    expect(r).toEqual(PREFERENCIAS_POR_DEFECTO);
    expect(r.estado_ticket).toEqual({ app: true, telegram: false });
    expect(r.seguimiento).toEqual({ app: true, telegram: false });
    expect(r.mencion).toEqual({ app: true, telegram: true });
    expect(r.resumen_diario).toEqual({ app: false, telegram: true });
  });

  it('una fila explícita sobrescribe el valor por defecto', () => {
    const r = resolverPreferencias([{ evento: 'estado_ticket', canal: 'telegram', activo: true }]);
    expect(r.estado_ticket.telegram).toBe(true);
    expect(r.estado_ticket.app).toBe(true);
  });

  it('ignora el canal correo y no muta los valores por defecto', () => {
    const r = resolverPreferencias([{ evento: 'mencion', canal: 'correo', activo: true }]);
    expect(r.mencion).toEqual({ app: true, telegram: true });
    r.mencion.app = false;
    expect(PREFERENCIAS_POR_DEFECTO.mencion.app).toBe(true);
  });
});

describe('PreferenciasEntrada', () => {
  it('acepta un cambio parcial', () => {
    expect(
      PreferenciasEntrada.safeParse({
        filas: [{ evento: 'mencion', app: true, telegram: false }],
      }).success,
    ).toBe(true);
  });

  it('rechaza resumen_diario con app: true', () => {
    expect(
      PreferenciasEntrada.safeParse({
        filas: [{ evento: 'resumen_diario', app: true, telegram: true }],
      }).success,
    ).toBe(false);
    expect(
      PreferenciasEntrada.safeParse({
        filas: [{ evento: 'resumen_diario', app: false, telegram: true }],
      }).success,
    ).toBe(true);
  });

  it('rechaza eventos repetidos', () => {
    const fila = { evento: 'mencion', app: true, telegram: true };
    expect(PreferenciasEntrada.safeParse({ filas: [fila, fila] }).success).toBe(false);
  });
});

describe('BotVincularEntrada', () => {
  it('normaliza el código a mayúsculas sin espacios', () => {
    const r = BotVincularEntrada.parse({ codigo: ' ab23cdef ', chat_id: 1 });
    expect(r.codigo).toBe('AB23CDEF');
    expect(r.telegram_usuario).toBeNull();
  });

  it('rechaza letras ambiguas y largos distintos de 8', () => {
    expect(BotVincularEntrada.safeParse({ codigo: 'ABCDEFIO', chat_id: 1 }).success).toBe(false);
    expect(BotVincularEntrada.safeParse({ codigo: 'AB23CDE', chat_id: 1 }).success).toBe(false);
  });
});

describe('LineaTiempoQuery', () => {
  it('acepta un rango válido', () => {
    expect(LineaTiempoQuery.safeParse({ desde: '2026-10-01', hasta: '2026-10-14' }).success).toBe(
      true,
    );
  });

  it('rechaza hasta anterior a desde', () => {
    expect(LineaTiempoQuery.safeParse({ desde: '2026-10-05', hasta: '2026-10-04' }).success).toBe(
      false,
    );
  });

  it('rechaza rangos de más de 62 días', () => {
    expect(LineaTiempoQuery.safeParse({ desde: '2026-10-01', hasta: '2026-12-02' }).success).toBe(
      true,
    );
    expect(LineaTiempoQuery.safeParse({ desde: '2026-10-01', hasta: '2026-12-03' }).success).toBe(
      false,
    );
  });
});

describe('EVENTOS_POR_FILTRO', () => {
  it('vencimientos tiene 2 eventos', () => {
    expect(EVENTOS_POR_FILTRO.vencimientos).toEqual(['vence_pronto', 'vencio']);
  });
});
