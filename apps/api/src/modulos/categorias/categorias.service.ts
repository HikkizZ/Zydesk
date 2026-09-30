import {
  CategoriaSalida,
  type CategoriaEntradaDatos,
  type CategoriaSalidaDatos,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarAuditoria } from '../../core/historial/auditoria.js';
import { enTransaccion } from '../../core/historial/transaccion.js';

interface FilaCategoria {
  id: number;
  nombre: string;
  responsable_defecto_id: number | null;
  responsable_nombre: string | null;
  plazo_respuesta: unknown;
  plazo_resolucion: unknown;
  activo: boolean;
  creado_en: Date;
  actualizado_en: Date;
}

const SELECT_CATEGORIA = `SELECT c.id, c.nombre, c.responsable_defecto_id, u.nombre AS responsable_nombre,
       c.plazo_respuesta, c.plazo_resolucion, c.activo, c.creado_en, c.actualizado_en
  FROM categoria c LEFT JOIN usuario u ON u.id = c.responsable_defecto_id`;

// `CategoriaSalida.parse` valida también al leer (spec §9).
function aSalida(f: FilaCategoria): CategoriaSalidaDatos {
  return CategoriaSalida.parse({
    id: f.id,
    nombre: f.nombre,
    responsable_defecto_id: f.responsable_defecto_id,
    responsable_defecto:
      f.responsable_defecto_id !== null
        ? { id: f.responsable_defecto_id, nombre: f.responsable_nombre ?? '' }
        : null,
    plazo_respuesta: f.plazo_respuesta,
    plazo_resolucion: f.plazo_resolucion,
    activo: f.activo,
    creado_en: f.creado_en.toISOString(),
    actualizado_en: f.actualizado_en.toISOString(),
  });
}

async function cargar(m: EntityManager, id: number): Promise<CategoriaSalidaDatos> {
  const [f]: FilaCategoria[] = await m.query(`${SELECT_CATEGORIA} WHERE c.id = $1`, [id]);
  if (!f) throw new ErrorApp('NO_ENCONTRADO', 'Categoría no encontrada');
  return aSalida(f);
}

export async function listarCategorias(q: {
  activo?: 'true' | 'false' | undefined;
}): Promise<CategoriaSalidaDatos[]> {
  const valores: unknown[] = [];
  let where = '';
  if (q.activo !== undefined) {
    valores.push(q.activo === 'true');
    where = ' WHERE c.activo = $1';
  }
  const filas: FilaCategoria[] = await dataSource.query(
    `${SELECT_CATEGORIA}${where} ORDER BY c.nombre, c.id`,
    valores,
  );
  return filas.map(aSalida);
}

async function validarResponsable(m: EntityManager, id: number | null): Promise<void> {
  if (id === null) return;
  const filas: unknown[] = await m.query(`SELECT 1 FROM usuario WHERE id = $1 AND activo`, [id]);
  if (filas.length === 0) {
    throw new ErrorApp('VALIDACION', 'Datos inválidos', {
      responsable_defecto_id: ['No existe o está inactivo'],
    });
  }
}

const esViolacionUnica = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';

async function auditar(
  tx: EntityManager,
  actor: UsuarioSesion,
  categoria_id: number,
  accion: 'creado' | 'editado' | 'desactivado' | 'reactivado',
): Promise<void> {
  await registrarAuditoria(tx, {
    accion: 'config_cambiada',
    usuario_id: actor.id,
    detalle: { seccion: 'categoria', categoria_id, accion },
  });
}

const conflictoNombre = () =>
  new ErrorApp('CONFLICTO', 'Ya existe una categoría con ese nombre', { campo: 'nombre' });

export async function crearCategoria(
  actor: UsuarioSesion,
  e: CategoriaEntradaDatos,
): Promise<CategoriaSalidaDatos> {
  try {
    return await enTransaccion(async (tx) => {
      await validarResponsable(tx, e.responsable_defecto_id);
      const [{ id }] = (await tx.query(
        `INSERT INTO categoria (nombre, responsable_defecto_id, plazo_respuesta, plazo_resolucion)
         VALUES ($1, $2, $3::jsonb, $4::jsonb) RETURNING id`,
        [
          e.nombre,
          e.responsable_defecto_id,
          JSON.stringify(e.plazo_respuesta),
          JSON.stringify(e.plazo_resolucion),
        ],
      )) as [{ id: number }];
      await auditar(tx, actor, id, 'creado');
      return cargar(tx, id);
    });
  } catch (err) {
    if (esViolacionUnica(err)) throw conflictoNombre();
    throw err;
  }
}

export async function editarCategoria(
  actor: UsuarioSesion,
  id: number,
  e: CategoriaEntradaDatos,
): Promise<CategoriaSalidaDatos> {
  try {
    return await enTransaccion(async (tx) => {
      await cargar(tx, id); // 404
      await validarResponsable(tx, e.responsable_defecto_id);
      await tx.query(
        `UPDATE categoria SET nombre = $2, responsable_defecto_id = $3, plazo_respuesta = $4::jsonb,
                plazo_resolucion = $5::jsonb, actualizado_en = now() WHERE id = $1`,
        [
          id,
          e.nombre,
          e.responsable_defecto_id,
          JSON.stringify(e.plazo_respuesta),
          JSON.stringify(e.plazo_resolucion),
        ],
      );
      await auditar(tx, actor, id, 'editado');
      return cargar(tx, id);
    });
  } catch (err) {
    if (esViolacionUnica(err)) throw conflictoNombre();
    throw err;
  }
}

export async function cambiarActivoCategoria(
  actor: UsuarioSesion,
  id: number,
  activo: boolean,
): Promise<CategoriaSalidaDatos> {
  return enTransaccion(async (tx) => {
    await cargar(tx, id); // 404
    await tx.query(`UPDATE categoria SET activo = $2, actualizado_en = now() WHERE id = $1`, [
      id,
      activo,
    ]);
    await auditar(tx, actor, id, activo ? 'reactivado' : 'desactivado');
    return cargar(tx, id);
  });
}
