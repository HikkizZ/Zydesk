import {
  iniciales,
  politicaContrasena,
  type UsuarioCrearEntradaDatos,
  type UsuarioEditarEntradaDatos,
  type UsuarioSalidaDatos,
  type UsuariosQueryDatos,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import { generarTemporal, hashear } from '../../core/auth/contrasena.js';
import { cerrarSesionesDeUsuario } from '../../core/auth/sesiones.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarAuditoria } from '../../core/historial/auditoria.js';
import { enTransaccion } from '../../core/historial/transaccion.js';

// Los 10 colores del diseño, asignados por rotación (spec §5.9).
export const COLORES_AVATAR = [
  '#F2D7C9',
  '#CFDDF3',
  '#D9EBD3',
  '#EBDDF3',
  '#F3E7C4',
  '#CDEBE6',
  '#F3CFD9',
  '#DAD6CF',
  '#D3E0F0',
  '#E6E2C8',
] as const;

interface FilaUsuario {
  id: number;
  nombre: string;
  correo: string;
  rol: UsuarioSalidaDatos['rol'];
  departamento_id: number | null;
  departamento_nombre: string | null;
  activo: boolean;
  color_avatar: string;
  debe_cambiar_contrasena: boolean;
  ultimo_ingreso: Date | null;
  creado_en: Date;
  actualizado_en: Date;
}

const SELECT_USUARIO = `SELECT u.id, u.nombre, u.correo, u.rol, u.departamento_id, d.nombre AS departamento_nombre,
       u.activo, u.color_avatar, u.debe_cambiar_contrasena, u.ultimo_ingreso, u.creado_en, u.actualizado_en
  FROM usuario u LEFT JOIN departamento d ON d.id = u.departamento_id`;

function aSalida(f: FilaUsuario): UsuarioSalidaDatos {
  return {
    id: f.id,
    nombre: f.nombre,
    correo: f.correo,
    rol: f.rol,
    departamento_id: f.departamento_id,
    departamento:
      f.departamento_id !== null
        ? { id: f.departamento_id, nombre: f.departamento_nombre ?? '' }
        : null,
    activo: f.activo,
    color_avatar: f.color_avatar,
    iniciales: iniciales(f.nombre),
    debe_cambiar_contrasena: f.debe_cambiar_contrasena,
    ultimo_ingreso: f.ultimo_ingreso?.toISOString() ?? null,
    creado_en: f.creado_en.toISOString(),
    actualizado_en: f.actualizado_en.toISOString(),
  };
}

async function cargar(m: EntityManager, id: number): Promise<UsuarioSalidaDatos> {
  const [f]: FilaUsuario[] = await m.query(`${SELECT_USUARIO} WHERE u.id = $1`, [id]);
  if (!f) throw new ErrorApp('NO_ENCONTRADO', 'Usuario no encontrado');
  return aSalida(f);
}

export async function listarUsuarios(q: UsuariosQueryDatos): Promise<UsuarioSalidaDatos[]> {
  const condiciones: string[] = [];
  const valores: unknown[] = [];
  if (q.activo !== undefined) {
    valores.push(q.activo === 'true');
    condiciones.push(`u.activo = $${valores.length}`);
  }
  if (q.rol) {
    valores.push(q.rol);
    condiciones.push(`u.rol = $${valores.length}`);
  }
  if (q.q) {
    valores.push(`%${q.q.replace(/[\\%_]/g, '\\$&')}%`);
    condiciones.push(`(u.nombre ILIKE $${valores.length} OR u.correo ILIKE $${valores.length})`);
  }
  const where = condiciones.length > 0 ? ` WHERE ${condiciones.join(' AND ')}` : '';
  const filas: FilaUsuario[] = await dataSource.query(
    `${SELECT_USUARIO}${where} ORDER BY u.nombre, u.id`,
    valores,
  );
  return filas.map(aSalida);
}

export function obtenerUsuario(id: number): Promise<UsuarioSalidaDatos> {
  return cargar(dataSource.manager, id);
}

async function validarDepartamento(m: EntityManager, id: number | null | undefined): Promise<void> {
  if (id === null || id === undefined) return;
  const existe: unknown[] = await m.query(`SELECT 1 FROM departamento WHERE id = $1`, [id]);
  if (existe.length === 0) {
    throw new ErrorApp('VALIDACION', 'Datos inválidos', { departamento_id: ['No existe'] });
  }
}

async function correoEnUso(m: EntityManager, correo: string, excepto?: number): Promise<boolean> {
  const filas: unknown[] = await m.query(
    `SELECT 1 FROM usuario WHERE correo = $1 AND ($2::int IS NULL OR id <> $2::int)`,
    [correo, excepto ?? null],
  );
  return filas.length > 0;
}

// Bloquea a los admins activos y comprueba que `id` no sea el último.
async function esUltimoAdminActivo(m: EntityManager, id: number): Promise<boolean> {
  const admins: { id: number }[] = await m.query(
    `SELECT id FROM usuario WHERE rol = 'admin' AND activo FOR UPDATE`,
  );
  return admins.length === 1 && admins[0]!.id === id;
}

// Inserta un usuario; sin `color_avatar` asigna uno del diseño por rotación. Sin validaciones ni auditoría:
// las hace quien llama (API o CLI). Es la única vía de alta: otros módulos la usan pasando su `tx`.
export async function insertarUsuario(
  tx: EntityManager,
  d: {
    nombre: string;
    correo: string;
    contrasena_hash: string;
    rol: UsuarioSalidaDatos['rol'];
    departamento_id?: number | null;
    color_avatar?: string | undefined;
    debe_cambiar_contrasena: boolean;
  },
): Promise<number> {
  const [{ n }] = (await tx.query(`SELECT count(*)::int AS n FROM usuario`)) as [{ n: number }];
  const [{ id }] = (await tx.query(
    `INSERT INTO usuario (nombre, correo, contrasena_hash, rol, departamento_id, color_avatar, debe_cambiar_contrasena)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      d.nombre,
      d.correo,
      d.contrasena_hash,
      d.rol,
      d.departamento_id ?? null,
      d.color_avatar ?? COLORES_AVATAR[n % COLORES_AVATAR.length],
      d.debe_cambiar_contrasena,
    ],
  )) as [{ id: number }];
  return id;
}

export async function registrarUltimoIngreso(tx: EntityManager, usuario_id: number): Promise<void> {
  await tx.query(`UPDATE usuario SET ultimo_ingreso = now() WHERE id = $1`, [usuario_id]);
}

// Cambio de contraseña hecho por la propia persona: limpia el flag de cambio obligatorio.
export async function guardarContrasenaPropia(
  tx: EntityManager,
  usuario_id: number,
  hash: string,
): Promise<void> {
  await tx.query(
    `UPDATE usuario SET contrasena_hash = $2, debe_cambiar_contrasena = false, actualizado_en = now()
      WHERE id = $1`,
    [usuario_id, hash],
  );
}

export async function guardarAceptacionTerminos(
  tx: EntityManager,
  usuario_id: number,
  version: string,
): Promise<void> {
  await tx.query(
    `UPDATE usuario SET terminos_version = $2, terminos_aceptados_en = now(), actualizado_en = now()
      WHERE id = $1`,
    [usuario_id, version],
  );
}

export async function crearUsuario(
  actor: UsuarioSesion,
  e: UsuarioCrearEntradaDatos,
): Promise<UsuarioSalidaDatos> {
  const politica = politicaContrasena(e.contrasena_temporal, e.correo);
  if (!politica.ok) {
    throw new ErrorApp('CONTRASENA_DEBIL', 'La contraseña no cumple la política', {
      motivo: politica.motivo,
    });
  }
  const hash = await hashear(e.contrasena_temporal);
  return enTransaccion(async (tx) => {
    if (await correoEnUso(tx, e.correo)) {
      throw new ErrorApp('CONFLICTO', 'Ya existe un usuario con ese correo', { campo: 'correo' });
    }
    await validarDepartamento(tx, e.departamento_id);
    const id = await insertarUsuario(tx, {
      nombre: e.nombre,
      correo: e.correo,
      contrasena_hash: hash,
      rol: e.rol,
      departamento_id: e.departamento_id,
      color_avatar: e.color_avatar,
      debe_cambiar_contrasena: true,
    });
    await registrarAuditoria(tx, {
      accion: 'usuario_creado',
      usuario_id: actor.id,
      detalle: { usuario_creado_id: id, rol: e.rol },
    });
    return cargar(tx, id);
  });
}

export async function editarUsuario(
  actor: UsuarioSesion,
  id: number,
  e: UsuarioEditarEntradaDatos,
): Promise<UsuarioSalidaDatos> {
  return enTransaccion(async (tx) => {
    const actual = await cargar(tx, id);
    if (e.correo !== undefined && (await correoEnUso(tx, e.correo, id))) {
      throw new ErrorApp('CONFLICTO', 'Ya existe un usuario con ese correo', { campo: 'correo' });
    }
    if (e.departamento_id !== undefined) await validarDepartamento(tx, e.departamento_id);
    const cambiaRol = e.rol !== undefined && e.rol !== actual.rol;
    if (
      cambiaRol &&
      actual.rol === 'admin' &&
      actual.activo &&
      (await esUltimoAdminActivo(tx, id))
    ) {
      throw new ErrorApp('CONFLICTO', 'No se puede quitar el rol al último administrador', {
        motivo: 'ultimo_admin',
      });
    }
    const campos: [string, unknown][] = [];
    for (const campo of ['nombre', 'correo', 'rol', 'departamento_id', 'color_avatar'] as const) {
      if (e[campo] !== undefined) campos.push([campo, e[campo]]);
    }
    if (campos.length > 0) {
      const sets = campos.map(([c], i) => `${c} = $${i + 2}`).join(', ');
      await tx.query(`UPDATE usuario SET ${sets}, actualizado_en = now() WHERE id = $1`, [
        id,
        ...campos.map(([, v]) => v),
      ]);
    }
    if (cambiaRol) {
      await registrarAuditoria(tx, {
        accion: 'rol_cambiado',
        usuario_id: actor.id,
        detalle: { usuario_afectado_id: id, de: actual.rol, a: e.rol },
      });
      await cerrarSesionesDeUsuario(tx, id, 'rol');
    }
    return cargar(tx, id);
  });
}

export async function desactivarUsuario(
  actor: UsuarioSesion,
  id: number,
): Promise<UsuarioSalidaDatos> {
  return enTransaccion(async (tx) => {
    const u = await cargar(tx, id);
    if (id === actor.id) {
      throw new ErrorApp('CONFLICTO', 'No puedes desactivar tu propia cuenta', {
        motivo: 'propio',
      });
    }
    if (u.rol === 'admin' && u.activo && (await esUltimoAdminActivo(tx, id))) {
      throw new ErrorApp('CONFLICTO', 'No se puede desactivar al último administrador', {
        motivo: 'ultimo_admin',
      });
    }
    await tx.query(`UPDATE usuario SET activo = false, actualizado_en = now() WHERE id = $1`, [id]);
    await registrarAuditoria(tx, {
      accion: 'usuario_desactivado',
      usuario_id: actor.id,
      detalle: { usuario_afectado_id: id },
    });
    await cerrarSesionesDeUsuario(tx, id, 'desactivado');
    return cargar(tx, id);
  });
}

export async function reactivarUsuario(
  actor: UsuarioSesion,
  id: number,
): Promise<UsuarioSalidaDatos> {
  return enTransaccion(async (tx) => {
    await cargar(tx, id);
    await tx.query(`UPDATE usuario SET activo = true, actualizado_en = now() WHERE id = $1`, [id]);
    await registrarAuditoria(tx, {
      accion: 'usuario_reactivado',
      usuario_id: actor.id,
      detalle: { usuario_afectado_id: id },
    });
    return cargar(tx, id);
  });
}

export async function restablecerContrasena(
  actor: UsuarioSesion,
  id: number,
): Promise<{ contrasena_temporal: string }> {
  const temporal = generarTemporal();
  const hash = await hashear(temporal);
  await enTransaccion(async (tx) => {
    await cargar(tx, id);
    await tx.query(
      `UPDATE usuario SET contrasena_hash = $2, debe_cambiar_contrasena = true, actualizado_en = now()
        WHERE id = $1`,
      [id, hash],
    );
    await registrarAuditoria(tx, {
      accion: 'contrasena_restablecida',
      usuario_id: actor.id,
      detalle: { usuario_afectado_id: id },
    });
    await cerrarSesionesDeUsuario(tx, id, 'contrasena_restablecida');
  });
  return { contrasena_temporal: temporal };
}
