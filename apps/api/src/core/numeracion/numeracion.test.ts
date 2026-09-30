import { describe, expect, it } from 'vitest';
import { dataSource } from '../../config/db.js';
import { enTransaccion } from '../historial/transaccion.js';
import { formatearCodigo, siguienteNumero, type FuenteNumeros } from './numeracion.js';

describe('formatearCodigo', () => {
  it('rellena con ceros y no recorta', () => {
    expect(formatearCodigo('TK-', 1048, 4)).toBe('TK-1048');
    expect(formatearCodigo('', 7, 3)).toBe('007');
    expect(formatearCodigo('TK-', 123456, 4)).toBe('TK-123456');
  });
});

describe('siguienteNumero correlativo', () => {
  it('dos llamadas → 1000, 1001', async () => {
    const a = await enTransaccion((tx) => siguienteNumero(tx, 'ticket'));
    const b = await enTransaccion((tx) => siguienteNumero(tx, 'ticket'));
    expect(a).toEqual({ numero: 1000, codigo: 'TK-1000' });
    expect(b).toEqual({ numero: 1001, codigo: 'TK-1001' });
  });

  it('una transacción que falla no consume número', async () => {
    await expect(
      enTransaccion(async (tx) => {
        await siguienteNumero(tx, 'ot');
        throw new Error('falla');
      }),
    ).rejects.toThrow('falla');
    const r = await enTransaccion((tx) => siguienteNumero(tx, 'ot'));
    expect(r.codigo).toBe('OT-0200');
  });
});

describe('siguienteNumero aleatorio', () => {
  const pasarAAleatorio = (digitos: number, inicial: number) =>
    dataSource.query(
      `UPDATE contador SET modo = 'aleatorio', digitos = $1, inicial = $2 WHERE clave = 'ticket'`,
      [digitos, inicial],
    );

  it('emite números dentro del rango [inicial, 10^digitos)', async () => {
    await pasarAAleatorio(3, 100);
    for (let i = 0; i < 30; i++) {
      const r = await enTransaccion((tx) => siguienteNumero(tx, 'ticket'));
      expect(r.numero).toBeGreaterThanOrEqual(100);
      expect(r.numero).toBeLessThan(1000);
      expect(r.codigo).toBe(`TK-${r.numero}`);
    }
  });

  it('reintenta ante colisión y falla tras 5', async () => {
    await pasarAAleatorio(3, 100);
    let llamadas = 0;
    const colisionaDosVeces: FuenteNumeros = {
      ultimoUsado: async () => null,
      usados: async () => 0,
      existe: async () => ++llamadas <= 2,
    };
    await enTransaccion((tx) => siguienteNumero(tx, 'ticket', colisionaDosVeces));
    expect(llamadas).toBe(3);
    const siempre: FuenteNumeros = { ...colisionaDosVeces, existe: async () => true };
    await expect(
      enTransaccion((tx) => siguienteNumero(tx, 'ticket', siempre)),
    ).rejects.toMatchObject({ codigo: 'CONFLICTO' });
  });

  it('usados ≥ 95 % de la capacidad → 409 NUMERACION_AGOTADA', async () => {
    await pasarAAleatorio(3, 100); // capacidad 900
    const casiLleno: FuenteNumeros = {
      ultimoUsado: async () => null,
      usados: async () => 855,
      existe: async () => false,
    };
    await expect(
      enTransaccion((tx) => siguienteNumero(tx, 'ticket', casiLleno)),
    ).rejects.toMatchObject({ codigo: 'NUMERACION_AGOTADA', status: 409 });
    const ok: FuenteNumeros = { ...casiLleno, usados: async () => 854 };
    await expect(enTransaccion((tx) => siguienteNumero(tx, 'ticket', ok))).resolves.toBeDefined();
  });
});
