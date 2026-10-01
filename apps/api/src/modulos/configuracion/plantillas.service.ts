import {
  PlantillaCotizacionSalida,
  type PlantillaActivoEntradaDatos,
  type PlantillaCotizacionEntradaDatos,
  type PlantillaCotizacionSalidaDatos,
  type PlantillasQueryDatos,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarAuditoria } from '../../core/historial/auditoria.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { numericoANumero } from '../../database/transformadores.js';

interface FilaPlantilla {
  id: number;
  nombre: string;
  descripcion: string | null;
  condiciones: string | null;
  activo: boolean;
  creado_en: Date;
  actualizado_en: Date;
}

interface FilaLinea {
  id: number;
  plantilla_id: number;
  orden: number;
  tipo: string;
  descripcion: string;
  cantidad: string;
  unidad: string;
  precio_unitario: string | null;
  descuento_pct: string;
}

const COLUMNAS = `id, nombre, descripcion, condiciones, activo, creado_en, actualizado_en`;

// `PlantillaCotizacionSalida.parse` valida también al leer.
async function cargarVarias(
  m: EntityManager,
  filas: FilaPlantilla[],
): Promise<PlantillaCotizacionSalidaDatos[]> {
  if (filas.length === 0) return [];
  const lineas: FilaLinea[] = await m.query(
    `SELECT id, plantilla_id, orden, tipo, descripcion, cantidad, unidad, precio_unitario, descuento_pct
       FROM plantilla_linea WHERE plantilla_id = ANY($1::int[]) ORDER BY plantilla_id, orden`,
    [filas.map((f) => f.id)],
  );
  return filas.map((f) =>
    PlantillaCotizacionSalida.parse({
      id: f.id,
      nombre: f.nombre,
      descripcion: f.descripcion,
      condiciones: f.condiciones,
      activo: f.activo,
      lineas: lineas
        .filter((l) => l.plantilla_id === f.id)
        .map((l) => ({
          id: l.id,
          orden: l.orden,
          tipo: l.tipo,
          descripcion: l.descripcion,
          cantidad: numericoANumero.from(l.cantidad),
          unidad: l.unidad,
          precio_unitario: numericoANumero.from(l.precio_unitario),
          descuento_pct: numericoANumero.from(l.descuento_pct),
        })),
      creado_en: f.creado_en.toISOString(),
      actualizado_en: f.actualizado_en.toISOString(),
    }),
  );
}

async function cargar(m: EntityManager, id: number): Promise<PlantillaCotizacionSalidaDatos> {
  const filas: FilaPlantilla[] = await m.query(
    `SELECT ${COLUMNAS} FROM plantilla_cotizacion WHERE id = $1`,
    [id],
  );
  const [p] = await cargarVarias(m, filas);
  if (!p) throw new ErrorApp('NO_ENCONTRADO', 'Plantilla no encontrada');
  return p;
}

// Bloquea la fila antes de reemplazar sus líneas o cambiar su estado.
async function bloquear(m: EntityManager, id: number): Promise<void> {
  const filas: unknown[] = await m.query(
    `SELECT 1 FROM plantilla_cotizacion WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (filas.length === 0) throw new ErrorApp('NO_ENCONTRADO', 'Plantilla no encontrada');
}

export async function listarPlantillas(
  q: PlantillasQueryDatos,
): Promise<PlantillaCotizacionSalidaDatos[]> {
  // Sin `activo` → solo activas
  const activo = q.activo === undefined ? true : q.activo;
  const filas: FilaPlantilla[] = await dataSource.query(
    `SELECT ${COLUMNAS} FROM plantilla_cotizacion WHERE activo = $1 ORDER BY nombre, id`,
    [activo],
  );
  return cargarVarias(dataSource.manager, filas);
}

const esViolacionUnica = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';

const conflictoNombre = () =>
  new ErrorApp('CONFLICTO', 'Ya existe una plantilla con ese nombre', { nombre: ['Ya existe'] });

async function insertarLineas(
  tx: EntityManager,
  plantilla_id: number,
  lineas: PlantillaCotizacionEntradaDatos['lineas'],
): Promise<void> {
  for (const [i, l] of lineas.entries()) {
    await tx.query(
      `INSERT INTO plantilla_linea
         (plantilla_id, orden, tipo, descripcion, cantidad, unidad, precio_unitario, descuento_pct)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        plantilla_id,
        i + 1,
        l.tipo,
        l.descripcion,
        l.cantidad,
        l.unidad,
        l.precio_unitario,
        l.descuento_pct,
      ],
    );
  }
}

async function auditar(
  tx: EntityManager,
  actor: UsuarioSesion,
  plantilla_id: number,
  accion: 'creada' | 'editada' | 'activada' | 'desactivada',
): Promise<void> {
  await registrarAuditoria(tx, {
    accion: 'config_cambiada',
    usuario_id: actor.id,
    detalle: { seccion: 'plantillas', plantilla_id, accion },
  });
}

export async function crearPlantilla(
  actor: UsuarioSesion,
  e: PlantillaCotizacionEntradaDatos,
): Promise<PlantillaCotizacionSalidaDatos> {
  try {
    return await enTransaccion(async (tx) => {
      const [{ id }] = (await tx.query(
        `INSERT INTO plantilla_cotizacion (nombre, descripcion, condiciones)
         VALUES ($1, $2, $3) RETURNING id`,
        [e.nombre, e.descripcion, e.condiciones],
      )) as [{ id: number }];
      await insertarLineas(tx, id, e.lineas);
      await auditar(tx, actor, id, 'creada');
      return cargar(tx, id);
    });
  } catch (err) {
    if (esViolacionUnica(err)) throw conflictoNombre();
    throw err;
  }
}

export async function editarPlantilla(
  actor: UsuarioSesion,
  id: number,
  e: PlantillaCotizacionEntradaDatos,
): Promise<PlantillaCotizacionSalidaDatos> {
  try {
    return await enTransaccion(async (tx) => {
      await bloquear(tx, id);
      await tx.query(
        `UPDATE plantilla_cotizacion
            SET nombre = $2, descripcion = $3, condiciones = $4, actualizado_en = now()
          WHERE id = $1`,
        [id, e.nombre, e.descripcion, e.condiciones],
      );
      await tx.query(`DELETE FROM plantilla_linea WHERE plantilla_id = $1`, [id]);
      await insertarLineas(tx, id, e.lineas);
      await auditar(tx, actor, id, 'editada');
      return cargar(tx, id);
    });
  } catch (err) {
    if (esViolacionUnica(err)) throw conflictoNombre();
    throw err;
  }
}

export async function cambiarActivoPlantilla(
  actor: UsuarioSesion,
  id: number,
  e: PlantillaActivoEntradaDatos,
): Promise<PlantillaCotizacionSalidaDatos> {
  return enTransaccion(async (tx) => {
    await bloquear(tx, id);
    const [{ activo }] = (await tx.query(`SELECT activo FROM plantilla_cotizacion WHERE id = $1`, [
      id,
    ])) as [{ activo: boolean }];
    if (activo !== e.activo) {
      await tx.query(
        `UPDATE plantilla_cotizacion SET activo = $2, actualizado_en = now() WHERE id = $1`,
        [id, e.activo],
      );
      await auditar(tx, actor, id, e.activo ? 'activada' : 'desactivada');
    }
    return cargar(tx, id);
  });
}
