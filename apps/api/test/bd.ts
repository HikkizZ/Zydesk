import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSource } from '../src/config/db.js';
import { sembrarBase } from '../src/database/semillas/base.js';

// Las migraciones (y el borrado) usan el DataSource owner; se importa perezosamente.
export async function prepararBd(): Promise<void> {
  const { dataSourceOwner } = await import('../src/database/data-source-owner.js');
  await dataSourceOwner.initialize();
  try {
    await dataSourceOwner.runMigrations();
  } finally {
    await dataSourceOwner.destroy();
  }
  await dataSource.initialize();
}

// El owner se abre una vez por archivo de test (setup.ts) y se reutiliza en cada reinicio.
let owner: DataSource | undefined;

export async function abrirOwner(): Promise<void> {
  if (owner?.isInitialized) return;
  // Conexión propia (solo SQL): varios tests inicializan y destruyen el `dataSourceOwner` compartido.
  const { dataSourceOwner } = await import('../src/database/data-source-owner.js');
  const { url } = dataSourceOwner.options as { url: string };
  owner = new DataSource({ type: 'postgres', url, logging: false });
  await owner.initialize();
}

export async function cerrarOwner(): Promise<void> {
  if (owner?.isInitialized) await owner.destroy();
  owner = undefined;
  ordenBorrado = undefined;
}

let ordenBorrado: string[] | undefined;

// Orden hijos -> padres sobre las FK bloqueantes (NO ACTION / RESTRICT), sin autorreferencias.
// Las FK SET NULL / CASCADE no impiden el DELETE. Un ciclo lanza error con los nombres de las tablas.
export function ordenarHijosAPadres(
  tablas: string[],
  fks: { hija: string; padre: string }[],
): string[] {
  const hijas = new Map<string, Set<string>>(tablas.map((t) => [t, new Set()]));
  for (const { hija, padre } of fks) {
    if (hija === padre || !hijas.has(hija) || !hijas.has(padre)) continue;
    hijas.get(padre)!.add(hija);
  }
  const pendientes = new Map(tablas.map((t) => [t, new Set(hijas.get(t))]));
  const orden: string[] = [];
  while (pendientes.size > 0) {
    const listas = [...pendientes].filter(([, h]) => h.size === 0).map(([t]) => t);
    if (listas.length === 0) {
      throw new Error(
        `Ciclo de claves foráneas bloqueantes entre: ${[...pendientes.keys()].join(', ')}`,
      );
    }
    for (const t of listas) {
      pendientes.delete(t);
      orden.push(t);
      for (const h of pendientes.values()) h.delete(t);
    }
  }
  return orden;
}

async function calcularOrden(o: DataSource): Promise<string[]> {
  const tablas: { tablename: string }[] = await o.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migracion' ORDER BY tablename`,
  );
  const fks: { hija: string; padre: string }[] = await o.query(
    `SELECT c.conrelid::regclass::text AS hija, c.confrelid::regclass::text AS padre
       FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confdeltype IN ('a', 'r') AND c.conrelid <> c.confrelid
        AND c.connamespace = 'public'::regnamespace`,
  );
  const limpiar = (n: string): string => n.replace(/^"|"$/g, '');
  return ordenarHijosAPadres(
    tablas.map((t) => t.tablename),
    fks.map((f) => ({ hija: limpiar(f.hija), padre: limpiar(f.padre) })),
  );
}

// Deja todas las tablas vacías, las identidades en 1 y la semilla base. `DELETE` solo de las tablas
// con filas (el TRUNCATE cuesta ~27 ms por tabla aunque esté vacía). Owner: la app no puede borrar
// `evento` ni `auditoria`.
export async function reiniciarBd(): Promise<void> {
  await abrirOwner();
  const o = owner!;
  ordenBorrado ??= await calcularOrden(o);
  const orden = ordenBorrado;
  if (orden.length > 0) {
    const sonda = orden
      .map((t) => `SELECT '${t}' AS t, EXISTS (SELECT 1 FROM "${t}") AS hay`)
      .join(' UNION ALL ');
    const filas: { t: string; hay: boolean }[] = await o.query(sonda);
    const conFilas = new Set(filas.filter((f) => f.hay).map((f) => f.t));
    for (const t of orden) {
      if (conFilas.has(t)) await o.query(`DELETE FROM "${t}"`);
    }
  }
  // Secuencias usadas (también las de tablas que recibieron filas y las perdieron por un rollback).
  const secuencias: { s: string }[] = await o.query(
    `SELECT quote_ident(schemaname) || '.' || quote_ident(sequencename) AS s
       FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL`,
  );
  for (const { s } of secuencias) await o.query(`ALTER SEQUENCE ${s} RESTART`);
  await sembrarBase(dataSource.manager);
}

export async function cerrarBd(): Promise<void> {
  if (dataSource.isInitialized) await dataSource.destroy();
}
