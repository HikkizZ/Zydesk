import { politicaContrasena } from '@zydesk/shared';
import { dataSource } from '../../../config/db.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { cargarLegal } from '../../../modulos/legal/legal.service.js';
import { conDataSource } from '../../admin.js';
import { sembrarBase } from '../base.js';
import { borrarArchivosDemo } from './archivos.js';
import { sembrarAuditoria } from './auditoria.js';
import { sembrarAvisos } from './avisos.js';
import { DOMINIO_DEMO, sembrarOrganizacion } from './base.js';
import { sembrarHoras } from './horas.js';
import { sembrarOts } from './ots.js';
import { sembrarTickets } from './tickets.js';

// `db:demo` (spec fase 9 §11.1): semilla de la demo con datos 100 % ficticios, idempotente, con guardas para que jamás
// corra sobre una instalación real. Separada de `semillas/desarrollo*.ts` (que no cambia).

export class ErrorDemo extends Error {}

export interface OpcionesDemo {
  reiniciar: boolean;
}

// Guardas 1, 2 y 4 (parte de entorno): no necesitan la base y corren ANTES de conectar.
export function validarEntorno(opciones: OpcionesDemo): void {
  if (!env.ZYDESK_DEMO) throw new ErrorDemo('db:demo solo corre con ZYDESK_DEMO=true');
  if (!env.DEMO_PASSWORD || !politicaContrasena(env.DEMO_PASSWORD, `demo${DOMINIO_DEMO}`).ok) {
    throw new ErrorDemo('DEMO_PASSWORD no definida o inválida');
  }
  if (opciones.reiniciar && !env.ZYDESK_DEMO_CONFIRMAR) {
    throw new ErrorDemo('--reiniciar exige ZYDESK_DEMO_CONFIRMAR con el nombre de la base');
  }
}

// TRUNCATE de todas las tablas (salvo `migracion`) con el owner, como `db:reiniciar`: borra TODO, también las cuentas
// reales del equipo y sus datos; los archivos que la semilla creó antes (`ARCHIVOS_DIR/demo/`) se borran del disco.
async function vaciarBase(): Promise<void> {
  const { dataSourceOwner } = await import('../../data-source-owner.js');
  await dataSourceOwner.initialize();
  try {
    const tablas: { tablename: string }[] = await dataSourceOwner.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migracion'`,
    );
    if (tablas.length > 0) {
      const lista = tablas.map((t) => `"${t.tablename}"`).join(', ');
      await dataSourceOwner.query(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await dataSourceOwner.destroy();
  }
  await borrarArchivosDemo();
}

// Con `dataSource` ya inicializado. Idempotente: dos cargas dejan lo mismo.
export async function cargarDemo(opciones: OpcionesDemo): Promise<void> {
  validarEntorno(opciones);
  const [{ base }] = await dataSource.query(`SELECT current_database() AS base`);
  if (opciones.reiniciar) {
    // Guarda 4: el operador escribe el nombre de la base. La guarda 3 no aplica: se vacía todo y se vuelve a sembrar
    if (env.ZYDESK_DEMO_CONFIRMAR !== base) {
      throw new ErrorDemo('ZYDESK_DEMO_CONFIRMAR no coincide con el nombre de la base');
    }
    await vaciarBase();
  } else {
    // Guarda 3: una instalación real nunca tiene cuentas fuera de @demo.zytech.dev
    const [{ ajenas }] = await dataSource.query(
      `SELECT count(*)::int AS ajenas FROM usuario WHERE correo NOT LIKE $1`,
      [`%${DOMINIO_DEMO}`],
    );
    if (ajenas > 0) {
      throw new ErrorDemo(
        `La base tiene ${ajenas} cuenta(s) que no son de la demo; db:demo no corre sobre ella (usa --reiniciar para vaciarla)`,
      );
    }
  }

  cargarLegal();
  await sembrarBase(dataSource.manager);
  const personas = await sembrarOrganizacion(env.DEMO_PASSWORD!);
  const tickets = await sembrarTickets(personas);
  await sembrarOts(personas, tickets);
  await sembrarHoras(personas);
  await sembrarAvisos(personas);
  await sembrarAuditoria(personas);
}

// Punto de entrada de `cli.ts demo`: sale con 1 si una guarda lo impide.
export async function ejecutarDemo(opciones: OpcionesDemo): Promise<void> {
  try {
    validarEntorno(opciones); // antes de conectar
    await conDataSource(() => cargarDemo(opciones));
    logger.info({ reiniciar: opciones.reiniciar }, 'semilla de demo aplicada');
  } catch (err) {
    if (err instanceof ErrorDemo) logger.error(err.message);
    else logger.error({ err }, 'no se pudo aplicar la semilla de demo');
    process.exit(1);
  }
}
