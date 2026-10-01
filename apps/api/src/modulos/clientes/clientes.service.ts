import {
  CONCEPTOS_TARIFA,
  type ClienteEntradaDatos,
  type ClienteResumenDatos,
  type ClienteSalidaDatos,
  type ClientesQueryDatos,
  type ContactoEntradaDatos,
  type ContactoSalidaDatos,
  type ContratoBolsaEntradaDatos,
  type ContratoBolsaSalidaDatos,
  type TarifaClienteEntradaDatos,
  type TarifaClienteSalidaDatos,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { enTransaccion } from '../../core/historial/transaccion.js';

// Clientes, contactos, bolsa y tarifas no generan `evento` ni `auditoria` (ADR 0003).

const CAMPOS_CLIENTE = [
  'nombre',
  'rut',
  'direccion',
  'es_interno',
  'condicion_pago',
  'exige_oc',
  'notas',
] as const;
const CAMPOS_CONTACTO = ['nombre', 'area', 'correo', 'telefono', 'aprueba_cotizaciones'] as const;
const CAMPOS_BOLSA = [
  'horas_mes',
  'vigente_desde',
  'vigente_hasta',
  'fecha_renovacion',
  'notas',
] as const;

type ActualizacionCliente = {
  [K in keyof ClienteEntradaDatos]?: ClienteEntradaDatos[K] | undefined;
};
type ActualizacionContacto = {
  [K in keyof ContactoEntradaDatos]?: ContactoEntradaDatos[K] | undefined;
};
type ActualizacionBolsa = {
  [K in keyof ContratoBolsaEntradaDatos]?: ContratoBolsaEntradaDatos[K] | undefined;
};

// "SET a = $2, b = $3" para los campos presentes (PATCH parcial); `$1` queda para el id.
function armarSet(
  datos: Record<string, unknown>,
  permitidos: readonly string[],
): { sql: string; valores: unknown[] } {
  const campos = permitidos.filter((c) => datos[c] !== undefined);
  return {
    sql: [...campos.map((c, i) => `${c} = $${i + 2}`), 'actualizado_en = now()'].join(', '),
    valores: campos.map((c) => datos[c]),
  };
}

// Traduce una violación de unicidad de `cliente` en 409 con el campo afectado.
function traducirUnico(err: unknown): never {
  const origen = (err as { driverError?: { code?: string; constraint?: string } }).driverError;
  if (origen?.code === '23505') {
    const campo = origen.constraint === 'cliente_rut_key' ? 'rut' : 'nombre';
    throw new ErrorApp('CONFLICTO', `Ya existe un cliente con ese ${campo}`, { campo });
  }
  throw err;
}

async function hoy(m: EntityManager): Promise<string> {
  const [f] = (await m.query(
    `SELECT ((now() AT TIME ZONE 'America/Santiago')::date)::text AS hoy`,
  )) as [{ hoy: string }];
  return f.hoy;
}

interface FilaCliente {
  id: number;
  nombre: string;
  rut: string | null;
  direccion: string | null;
  es_interno: boolean;
  condicion_pago: string | null;
  exige_oc: boolean;
  notas: string | null;
  activo: boolean;
  creado_en: Date;
  actualizado_en: Date;
}

interface FilaBolsa {
  id: number;
  cliente_id: number;
  horas_mes: number;
  vigente_desde: string;
  vigente_hasta: string | null;
  fecha_renovacion: string | null;
  notas: string | null;
}

const SELECT_BOLSA = `SELECT id, cliente_id, horas_mes::float8 AS horas_mes, vigente_desde::text AS vigente_desde,
       vigente_hasta::text AS vigente_hasta, fecha_renovacion::text AS fecha_renovacion, notas
  FROM contrato_bolsa`;

const SELECT_CONTACTO = `SELECT id, cliente_id, nombre, area, correo, telefono, aprueba_cotizaciones, activo FROM contacto`;

// ADR 0015 / 0023.18: horas usadas en el mes calendario actual (Santiago) por todas las OT con ese contrato.
export async function usadasMesDeContrato(
  m: Pick<EntityManager, 'query'>,
  contrato_id: number,
): Promise<number> {
  const [f]: { usadas_mes: number }[] = await m.query(
    `SELECT COALESCE(sum(rh.horas), 0)::float8 AS usadas_mes
       FROM registro_horas rh JOIN ot o ON o.id = rh.ot_id
      WHERE o.contrato_id = $1
        AND date_trunc('month', rh.fecha) = date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date)`,
    [contrato_id],
  );
  return f!.usadas_mes;
}

// Solo el contrato vigente trae horas usadas; los del historial, null.
async function bolsaSalida(
  m: Pick<EntityManager, 'query'>,
  f: FilaBolsa,
  fechaHoy: string,
): Promise<ContratoBolsaSalidaDatos> {
  const vigente =
    f.vigente_desde <= fechaHoy && (f.vigente_hasta === null || f.vigente_hasta >= fechaHoy);
  return {
    id: f.id,
    cliente_id: f.cliente_id,
    horas_mes: f.horas_mes,
    vigente_desde: f.vigente_desde,
    vigente_hasta: f.vigente_hasta,
    fecha_renovacion: f.fecha_renovacion,
    notas: f.notas,
    // ADR 0015: vigente = desde ≤ hoy y (hasta nulo o ≥ hoy), en America/Santiago
    vigente,
    horas_usadas_mes: vigente ? await usadasMesDeContrato(m, f.id) : null,
  };
}

async function existeCliente(m: EntityManager, id: number, bloquear = false): Promise<void> {
  const filas: unknown[] = await m.query(
    `SELECT 1 FROM cliente WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (filas.length === 0) throw new ErrorApp('NO_ENCONTRADO', 'Cliente no encontrado');
}

export async function listarClientes(q: ClientesQueryDatos): Promise<ClienteResumenDatos[]> {
  const valores: unknown[] = [q.activo === 'false' ? false : true];
  const condiciones = ['c.activo = $1'];
  if (q.q) {
    const escapar = (s: string) => s.replace(/[\\%_]/g, '\\$&');
    valores.push(`%${escapar(q.q)}%`, `%${escapar(q.q.replace(/[.\s]/g, ''))}%`);
    condiciones.push(`(c.nombre ILIKE $2 OR c.rut ILIKE $3)`);
  }
  const filas: ClienteResumenDatos[] = await dataSource.query(
    `SELECT c.id, c.nombre, c.rut, c.es_interno, c.activo,
            EXISTS (SELECT 1 FROM contrato_bolsa b WHERE b.cliente_id = c.id) AS tiene_bolsa,
            (SELECT count(*)::int FROM ticket t WHERE t.cliente_id = c.id AND t.cerrado_en IS NULL) AS tickets_abiertos
       FROM cliente c WHERE ${condiciones.join(' AND ')} ORDER BY c.nombre, c.id`,
    valores,
  );
  return filas;
}

export async function obtenerCliente(
  id: number,
  m: EntityManager = dataSource.manager,
): Promise<ClienteSalidaDatos> {
  const [c]: FilaCliente[] = await m.query(`SELECT * FROM cliente WHERE id = $1`, [id]);
  if (!c) throw new ErrorApp('NO_ENCONTRADO', 'Cliente no encontrado');
  const contactos: ContactoSalidaDatos[] = await m.query(
    `${SELECT_CONTACTO} WHERE cliente_id = $1 ORDER BY nombre, id`,
    [id],
  );
  const fechaHoy = await hoy(m);
  const contratos: FilaBolsa[] = await m.query(
    `${SELECT_BOLSA} WHERE cliente_id = $1 ORDER BY vigente_desde DESC, id DESC`,
    [id],
  );
  const historial: ContratoBolsaSalidaDatos[] = [];
  for (const f of contratos) historial.push(await bolsaSalida(m, f, fechaHoy));
  const tarifas: TarifaClienteSalidaDatos[] = await m.query(
    `SELECT concepto, valor::float8 AS valor FROM tarifa_cliente WHERE cliente_id = $1`,
    [id],
  );
  tarifas.sort(
    (a, b) => CONCEPTOS_TARIFA.indexOf(a.concepto) - CONCEPTOS_TARIFA.indexOf(b.concepto),
  );
  return {
    id: c.id,
    nombre: c.nombre,
    rut: c.rut,
    direccion: c.direccion,
    es_interno: c.es_interno,
    condicion_pago: c.condicion_pago,
    exige_oc: c.exige_oc,
    notas: c.notas,
    activo: c.activo,
    contactos,
    bolsa: { vigente: historial.find((b) => b.vigente) ?? null, historial },
    tarifas,
    creado_en: c.creado_en.toISOString(),
    actualizado_en: c.actualizado_en.toISOString(),
  };
}

export async function crearCliente(e: ClienteEntradaDatos): Promise<ClienteSalidaDatos> {
  try {
    return await enTransaccion(async (tx) => {
      const [{ id }] = (await tx.query(
        `INSERT INTO cliente (nombre, rut, direccion, es_interno, condicion_pago, exige_oc, notas)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [e.nombre, e.rut, e.direccion, e.es_interno, e.condicion_pago, e.exige_oc, e.notas],
      )) as [{ id: number }];
      return obtenerCliente(id, tx);
    });
  } catch (err) {
    return traducirUnico(err);
  }
}

export async function editarCliente(
  id: number,
  e: ActualizacionCliente,
): Promise<ClienteSalidaDatos> {
  try {
    return await enTransaccion(async (tx) => {
      await existeCliente(tx, id, true);
      const { sql, valores } = armarSet(e, CAMPOS_CLIENTE);
      await tx.query(`UPDATE cliente SET ${sql} WHERE id = $1`, [id, ...valores]);
      return obtenerCliente(id, tx);
    });
  } catch (err) {
    return traducirUnico(err);
  }
}

export async function cambiarEstadoCliente(
  id: number,
  activo: boolean,
): Promise<ClienteSalidaDatos> {
  return enTransaccion(async (tx) => {
    await existeCliente(tx, id, true);
    await tx.query(`UPDATE cliente SET activo = $2, actualizado_en = now() WHERE id = $1`, [
      id,
      activo,
    ]);
    return obtenerCliente(id, tx);
  });
}

// ---- Contactos ----

export async function crearContacto(
  clienteId: number,
  e: ContactoEntradaDatos,
): Promise<ContactoSalidaDatos> {
  return enTransaccion(async (tx) => {
    await existeCliente(tx, clienteId);
    const [fila]: ContactoSalidaDatos[] = await tx.query(
      `INSERT INTO contacto (cliente_id, nombre, area, correo, telefono, aprueba_cotizaciones)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, cliente_id, nombre, area, correo, telefono, aprueba_cotizaciones, activo`,
      [clienteId, e.nombre, e.area, e.correo, e.telefono, e.aprueba_cotizaciones],
    );
    return fila!;
  });
}

export async function editarContacto(
  clienteId: number,
  contactoId: number,
  e: ActualizacionContacto,
): Promise<ContactoSalidaDatos> {
  const { sql, valores } = armarSet(e, CAMPOS_CONTACTO);
  // UPDATE … RETURNING devuelve [filas, cantidad]
  const [filas] = (await dataSource.query(
    `UPDATE contacto SET ${sql} WHERE id = $1 AND cliente_id = $${valores.length + 2}
     RETURNING id, cliente_id, nombre, area, correo, telefono, aprueba_cotizaciones, activo`,
    [contactoId, ...valores, clienteId],
  )) as [ContactoSalidaDatos[], number];
  const fila = filas[0];
  if (!fila) throw new ErrorApp('NO_ENCONTRADO', 'Contacto no encontrado');
  return fila;
}

export async function borrarContacto(clienteId: number, contactoId: number): Promise<void> {
  const [, cantidad] = (await dataSource.query(
    `DELETE FROM contacto WHERE id = $1 AND cliente_id = $2 RETURNING id`,
    [contactoId, clienteId],
  )) as [unknown[], number];
  if (cantidad === 0) throw new ErrorApp('NO_ENCONTRADO', 'Contacto no encontrado');
}

// ---- Bolsa de horas (ADR 0015) ----

async function validarSolape(
  tx: EntityManager,
  clienteId: number,
  desde: string,
  hasta: string | null,
  excepto?: number,
): Promise<void> {
  const filas: unknown[] = await tx.query(
    `SELECT 1 FROM contrato_bolsa
      WHERE cliente_id = $1 AND ($4::int IS NULL OR id <> $4::int)
        AND vigente_desde <= COALESCE($3::date, 'infinity'::date)
        AND COALESCE(vigente_hasta, 'infinity'::date) >= $2::date`,
    [clienteId, desde, hasta, excepto ?? null],
  );
  if (filas.length > 0) {
    throw new ErrorApp('CONFLICTO', 'Ya hay un contrato de bolsa que se solapa con ese período', {
      motivo: 'solapa_vigente',
    });
  }
}

export async function crearBolsa(
  clienteId: number,
  e: ContratoBolsaEntradaDatos,
): Promise<ContratoBolsaSalidaDatos> {
  return enTransaccion(async (tx) => {
    await existeCliente(tx, clienteId, true);
    await validarSolape(tx, clienteId, e.vigente_desde, e.vigente_hasta);
    const [{ id }] = (await tx.query(
      `INSERT INTO contrato_bolsa (cliente_id, horas_mes, vigente_desde, vigente_hasta, fecha_renovacion, notas)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [clienteId, e.horas_mes, e.vigente_desde, e.vigente_hasta, e.fecha_renovacion, e.notas],
    )) as [{ id: number }];
    const [f]: FilaBolsa[] = await tx.query(`${SELECT_BOLSA} WHERE id = $1`, [id]);
    return bolsaSalida(tx, f!, await hoy(tx));
  });
}

export async function editarBolsa(
  clienteId: number,
  contratoId: number,
  e: ActualizacionBolsa,
): Promise<ContratoBolsaSalidaDatos> {
  return enTransaccion(async (tx) => {
    await existeCliente(tx, clienteId, true);
    const [actual]: FilaBolsa[] = await tx.query(
      `${SELECT_BOLSA} WHERE id = $1 AND cliente_id = $2`,
      [contratoId, clienteId],
    );
    if (!actual) throw new ErrorApp('NO_ENCONTRADO', 'Contrato no encontrado');
    const desde = e.vigente_desde ?? actual.vigente_desde;
    const hasta = e.vigente_hasta === undefined ? actual.vigente_hasta : e.vigente_hasta;
    if (hasta !== null && hasta < desde) {
      throw new ErrorApp('VALIDACION', 'Datos inválidos', {
        vigente_hasta: ['vigente_hasta debe ser igual o posterior a vigente_desde'],
      });
    }
    await validarSolape(tx, clienteId, desde, hasta, contratoId);
    const { sql, valores } = armarSet(e, CAMPOS_BOLSA);
    await tx.query(`UPDATE contrato_bolsa SET ${sql} WHERE id = $1`, [contratoId, ...valores]);
    const [f]: FilaBolsa[] = await tx.query(`${SELECT_BOLSA} WHERE id = $1`, [contratoId]);
    return bolsaSalida(tx, f!, await hoy(tx));
  });
}

// ---- Tarifas por cliente ----

export async function reemplazarTarifas(
  clienteId: number,
  tarifas: TarifaClienteEntradaDatos,
): Promise<TarifaClienteSalidaDatos[]> {
  return enTransaccion(async (tx) => {
    await existeCliente(tx, clienteId, true);
    await tx.query(`DELETE FROM tarifa_cliente WHERE cliente_id = $1`, [clienteId]);
    for (const t of tarifas) {
      await tx.query(
        `INSERT INTO tarifa_cliente (cliente_id, concepto, valor) VALUES ($1, $2, $3)`,
        [clienteId, t.concepto, t.valor],
      );
    }
    return (await obtenerCliente(clienteId, tx)).tarifas;
  });
}
