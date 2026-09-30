import { randomInt } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { ErrorApp } from '../errores/error-app.js';

export type ClaveContador = 'ticket' | 'ot';

export interface FilaContador {
  clave: ClaveContador;
  prefijo: string;
  inicial: number;
  digitos: number;
  modo: 'correlativo' | 'aleatorio';
  valor: number;
}

export function formatearCodigo(prefijo: string, numero: number, digitos: number): string {
  return `${prefijo}${String(numero).padStart(digitos, '0')}`;
}

export interface FuenteNumeros {
  ultimoUsado(tx: EntityManager, clave: ClaveContador): Promise<number | null>;
  usados(tx: EntityManager, clave: ClaveContador): Promise<number>;
  existe(tx: EntityManager, clave: ClaveContador, numero: number): Promise<boolean>;
}

export async function leerContador(
  tx: EntityManager,
  clave: ClaveContador,
  bloquear = false,
): Promise<FilaContador> {
  const filas: FilaContador[] = await tx.query(
    `SELECT clave, prefijo, inicial, digitos, modo, valor FROM contador WHERE clave = $1${
      bloquear ? ' FOR UPDATE' : ''
    }`,
    [clave],
  );
  if (!filas[0]) throw new ErrorApp('INTERNO', 'Contador no configurado');
  return filas[0];
}

// Fase 1: no hay tablas `ticket`/`ot`; `contador.valor` hace de "último usado" (spec §10.1).
// La Fase 2 la sustituye por MAX(numero)/COUNT/EXISTS sobre las tablas reales.
export const fuenteNumerosFase1: FuenteNumeros = {
  async ultimoUsado(tx, clave) {
    const c = await leerContador(tx, clave);
    return c.valor < c.inicial ? null : c.valor;
  },
  async usados(tx, clave) {
    const c = await leerContador(tx, clave);
    if (c.modo === 'aleatorio') return 0;
    return c.valor < c.inicial ? 0 : c.valor - c.inicial + 1;
  },
  async existe() {
    return false;
  },
};

// ADR 0006 y 0014. Debe llamarse dentro de la misma transacción que inserta la entidad.
export async function siguienteNumero(
  tx: EntityManager,
  clave: ClaveContador,
  fuente: FuenteNumeros = fuenteNumerosFase1,
): Promise<{ numero: number; codigo: string }> {
  const c = await leerContador(tx, clave);
  if (c.modo === 'correlativo') {
    const [filas] = (await tx.query(
      `UPDATE contador SET valor = valor + 1 WHERE clave = $1 RETURNING valor, prefijo, digitos`,
      [clave],
    )) as [{ valor: number; prefijo: string; digitos: number }[], number];
    const f = filas[0]!;
    return { numero: f.valor, codigo: formatearCodigo(f.prefijo, f.valor, f.digitos) };
  }

  const tope = 10 ** c.digitos;
  const capacidad = tope - c.inicial;
  if ((await fuente.usados(tx, clave)) >= 0.95 * capacidad) {
    throw new ErrorApp(
      'NUMERACION_AGOTADA',
      'La numeración está casi agotada: aumenta los dígitos en Configuración',
    );
  }
  for (let intento = 0; intento < 5; intento++) {
    const numero = randomInt(c.inicial, tope);
    if (!(await fuente.existe(tx, clave, numero))) {
      return { numero, codigo: formatearCodigo(c.prefijo, numero, c.digitos) };
    }
  }
  throw new ErrorApp('CONFLICTO', 'No se pudo asignar un número; intenta de nuevo');
}
