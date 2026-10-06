import type { EntityManager } from 'typeorm';

// Utilidades de la semilla de demo (spec fase 9 §11). SQL directo, sin importar de `semillas/desarrollo*.ts`.
// Todas las fechas son relativas a "hoy" en Santiago y nunca caen en el futuro (salvo los vencimientos).

export type Tx = Pick<EntityManager, 'query'>;
export type Personas = Map<string, number>;

// Instante de «hoy − dias» a la hora indicada (Santiago). Nunca posterior a «ahora − 3 min»: lo ocurrido hoy a una
// hora que todavía no llega queda justo antes de ahora.
export async function instante(tx: Tx, dias: number, hora: string): Promise<Date> {
  const [{ t }] = await tx.query(
    `SELECT LEAST(((now() AT TIME ZONE 'America/Santiago')::date - $1::int + $2::time) AT TIME ZONE 'America/Santiago',
                  now() - interval '3 minutes') AS t`,
    [dias, hora],
  );
  return t as Date;
}

// Igual, sin tope: solo para vencimientos (`fecha_limite`), que sí pueden estar en el futuro.
export async function instanteLibre(tx: Tx, dias: number, hora: string): Promise<Date> {
  const [{ t }] = await tx.query(
    `SELECT ((now() AT TIME ZONE 'America/Santiago')::date - $1::int + $2::time) AT TIME ZONE 'America/Santiago' AS t`,
    [dias, hora],
  );
  return t as Date;
}

export async function fechaRelativa(tx: Tx, dias: number): Promise<string> {
  const [{ f }] = await tx.query(
    `SELECT to_char((now() AT TIME ZONE 'America/Santiago')::date - $1::int, 'YYYY-MM-DD') AS f`,
    [dias],
  );
  return f as string;
}

// Hora HH:MM entre las 08:30 y las 16:30, estable según un número (cada ticket nace a su hora).
export function horaDe(n: number): string {
  const minutos = 8 * 60 + 30 + ((n * 37) % 480);
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

export const minutos = (d: Date, m: number): Date => new Date(d.getTime() + m * 60_000);

// Generador pseudoaleatorio determinista (mulberry32): la planilla de horas sale igual en cada carga.
export function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Valor de la UF (ficticio, plausible) para el día «hoy − dias»: creciente con el tiempo, alrededor de 41 1xx.
export function valorUf(dias: number): number {
  return Math.round((41190 - 5.1 * dias) * 100) / 100;
}

export async function evento(
  tx: Tx,
  entidad: 'ticket' | 'ot' | 'contador',
  entidad_id: number | string,
  autor: number | null,
  creado_en: Date,
  accion: string,
  extra: { campo?: string; anterior?: string; nuevo?: string; datos?: unknown } = {},
): Promise<void> {
  await tx.query(
    `INSERT INTO evento (entidad, entidad_id, autor_id, accion, campo, valor_anterior, valor_nuevo, datos, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [
      entidad,
      String(entidad_id),
      autor,
      accion,
      extra.campo ?? null,
      extra.anterior ?? null,
      extra.nuevo ?? null,
      extra.datos === undefined || extra.datos === null ? null : JSON.stringify(extra.datos),
      creado_en,
    ],
  );
}

// RUT inventado con dígito verificador válido (módulo 11) a partir del cuerpo.
export function rutConDv(cuerpo: number): string {
  let suma = 0;
  let factor = 2;
  for (const d of String(cuerpo).split('').reverse()) {
    suma += Number(d) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (suma % 11);
  return `${cuerpo}-${dv === 11 ? '0' : dv === 10 ? 'K' : String(dv)}`;
}
