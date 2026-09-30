import { describe, expect, it } from 'vitest';
import { ESTADOS_TICKET, type EstadoTicket } from '../enums/ticket.js';
import { CambioEstadoTicket, esCerrado, puedeTransicionar, transicionesDesde } from './ticket.js';

const CERRADOS: EstadoTicket[] = ['resuelto', 'descartado', 'duplicado'];

describe('máquina de estados del ticket', () => {
  const combinaciones = ESTADOS_TICKET.flatMap((desde) =>
    ESTADOS_TICKET.map((hasta) => {
      const esperado = desde !== hasta && (CERRADOS.includes(desde) ? hasta === 'en_curso' : true);
      return [desde, hasta, esperado] as const;
    }),
  );

  it.each(combinaciones)('%s → %s: %s', (desde, hasta, esperado) => {
    expect(puedeTransicionar(desde, hasta)).toBe(esperado);
  });

  it('cubre las 36 combinaciones', () => {
    expect(combinaciones).toHaveLength(36);
  });

  it('un cerrado solo se reabre a en_curso', () => {
    expect(transicionesDesde('resuelto')).toEqual(['en_curso']);
    expect(transicionesDesde('descartado')).toEqual(['en_curso']);
  });

  it('un abierto puede ir a los otros 5 estados', () => {
    expect(transicionesDesde('nuevo')).toHaveLength(5);
    expect(transicionesDesde('nuevo')).not.toContain('nuevo');
  });

  it('esCerrado', () => {
    expect(ESTADOS_TICKET.filter(esCerrado)).toEqual(CERRADOS);
  });
});

describe('CambioEstadoTicket', () => {
  it('rechaza en_espera sin espera_de', () => {
    expect(CambioEstadoTicket.safeParse({ estado: 'en_espera' }).success).toBe(false);
    expect(
      CambioEstadoTicket.safeParse({ estado: 'en_espera', espera_de: 'repuesto' }).success,
    ).toBe(true);
  });

  it('rechaza descartado sin motivo y duplicado sin duplicado_de_id', () => {
    expect(CambioEstadoTicket.safeParse({ estado: 'descartado' }).success).toBe(false);
    expect(
      CambioEstadoTicket.safeParse({ estado: 'descartado', motivo: 'Sin respuesta' }).success,
    ).toBe(true);
    expect(CambioEstadoTicket.safeParse({ estado: 'duplicado' }).success).toBe(false);
    expect(CambioEstadoTicket.safeParse({ estado: 'duplicado', duplicado_de_id: 7 }).success).toBe(
      true,
    );
  });

  it('acepta nuevo, en_curso y resuelto sin datos y rechaza estados desconocidos', () => {
    for (const estado of ['nuevo', 'en_curso', 'resuelto']) {
      expect(CambioEstadoTicket.safeParse({ estado }).success).toBe(true);
    }
    expect(CambioEstadoTicket.safeParse({ estado: 'archivado' }).success).toBe(false);
  });
});
