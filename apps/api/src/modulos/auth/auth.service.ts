import {
  PERMISOS_POR_ROL,
  iniciales,
  politicaContrasena,
  type CambiarContrasenaEntradaDatos,
  type IngresoEntradaDatos,
  type SesionSalidaDatos,
  type YoSalidaDatos,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import { HASH_FICTICIO, hashear, verificar } from '../../core/auth/contrasena.js';
import { comprobarLimites, registrarFallo } from '../../core/auth/limites.js';
import {
  cerrarSesionesDeUsuario,
  crearSesion,
  type SesionCreada,
} from '../../core/auth/sesiones.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarAuditoria } from '../../core/historial/auditoria.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import {
  guardarAceptacionTerminos,
  guardarContrasenaPropia,
  registrarUltimoIngreso,
} from '../usuarios/usuarios.service.js';
import { versionTerminosVigente } from '../legal/legal.service.js';

interface FilaYo {
  id: number;
  nombre: string;
  correo: string;
  rol: Usuario['rol'];
  color_avatar: string;
  debe_cambiar_contrasena: boolean;
  terminos_version: string | null;
  departamento_id: number | null;
  departamento_nombre: string | null;
}

export async function construirYo(usuario_id: number): Promise<YoSalidaDatos> {
  const [u]: FilaYo[] = await dataSource.query(
    `SELECT u.id, u.nombre, u.correo, u.rol, u.color_avatar, u.debe_cambiar_contrasena, u.terminos_version,
            d.id AS departamento_id, d.nombre AS departamento_nombre
       FROM usuario u LEFT JOIN departamento d ON d.id = u.departamento_id
      WHERE u.id = $1`,
    [usuario_id],
  );
  if (!u) throw new ErrorApp('NO_AUTENTICADO', 'Inicia sesión');
  const config: { clave: string; valor: unknown }[] = await dataSource.query(
    `SELECT clave, valor FROM configuracion WHERE clave IN ('nombre_app', 'logo')`,
  );
  const nombre_app = config.find((c) => c.clave === 'nombre_app')?.valor;
  const logo = config.find((c) => c.clave === 'logo')?.valor;
  return {
    id: u.id,
    nombre: u.nombre,
    correo: u.correo,
    rol: u.rol,
    departamento:
      u.departamento_id !== null
        ? { id: u.departamento_id, nombre: u.departamento_nombre ?? '' }
        : null,
    color_avatar: u.color_avatar,
    iniciales: iniciales(u.nombre),
    permisos: [...PERMISOS_POR_ROL[u.rol]],
    debe_cambiar_contrasena: u.debe_cambiar_contrasena,
    debe_aceptar_terminos: u.terminos_version !== versionTerminosVigente(),
    terminos_version_vigente: versionTerminosVigente(),
    nombre_app: typeof nombre_app === 'string' ? nombre_app : 'Zydesk',
    logo_url: logo ? '/api/config/logo' : null,
  };
}

export async function ingresar(
  entrada: IngresoEntradaDatos,
  ip: string,
  user_agent: string | null,
): Promise<{ sesion: SesionCreada; yo: YoSalidaDatos }> {
  await comprobarLimites(entrada.correo, ip);
  const usuario = await dataSource.manager.findOneBy(Usuario, { correo: entrada.correo });
  // Siempre se verifica un hash (el ficticio si el correo no existe): tiempo de respuesta parejo.
  const coincide = await verificar(usuario?.contrasena_hash ?? HASH_FICTICIO, entrada.contrasena);
  if (!usuario || !usuario.activo || !coincide) {
    await registrarFallo(entrada.correo, user_agent);
    throw new ErrorApp('CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
  }
  // Sesión nueva en cada ingreso (anti fijación).
  const sesion = await enTransaccion(async (tx) => {
    const s = await crearSesion(tx, {
      usuario_id: usuario.id,
      mantener: entrada.mantener,
      ip,
      user_agent,
    });
    await registrarUltimoIngreso(tx, usuario.id);
    await registrarAuditoria(tx, {
      accion: 'ingreso_ok',
      usuario_id: usuario.id,
      detalle: {
        correo: usuario.correo,
        user_agent: user_agent ? user_agent.slice(0, 300) : null,
        mantener: entrada.mantener,
        sesion_id: s.id,
      },
    });
    return s;
  });
  return { sesion, yo: await construirYo(usuario.id) };
}

export async function salir(actor: UsuarioSesion): Promise<void> {
  await enTransaccion(async (tx) => {
    await tx.query(`DELETE FROM sesion WHERE id = $1`, [actor.sesion_id]);
    await registrarAuditoria(tx, {
      accion: 'cierre_sesion',
      usuario_id: actor.id,
      detalle: { sesion_id: actor.sesion_id },
    });
  });
}

export async function cambiarContrasena(
  actor: UsuarioSesion,
  entrada: CambiarContrasenaEntradaDatos,
  ip: string,
  user_agent: string | null,
): Promise<SesionCreada> {
  const usuario = await dataSource.manager.findOneByOrFail(Usuario, { id: actor.id });
  if (!(await verificar(usuario.contrasena_hash, entrada.actual))) {
    throw new ErrorApp('CONTRASENA_ACTUAL_INCORRECTA', 'La contraseña actual no es correcta');
  }
  const politica = politicaContrasena(entrada.nueva, usuario.correo);
  if (!politica.ok) {
    throw new ErrorApp('CONTRASENA_DEBIL', 'La contraseña no cumple la política', {
      motivo: politica.motivo,
    });
  }
  const hash = await hashear(entrada.nueva);
  const [sesionActual]: { mantener: boolean; origen: 'web' | 'bot' }[] = await dataSource.query(
    `SELECT mantener, origen FROM sesion WHERE id = $1`,
    [actor.sesion_id],
  );
  return enTransaccion(async (tx) => {
    await guardarContrasenaPropia(tx, actor.id, hash);
    await registrarAuditoria(tx, { accion: 'contrasena_cambiada', usuario_id: actor.id });
    await cerrarSesionesDeUsuario(tx, actor.id, 'cambio_contrasena');
    return crearSesion(tx, {
      usuario_id: actor.id,
      origen: sesionActual?.origen ?? 'web',
      mantener: sesionActual?.mantener ?? false,
      ip,
      user_agent,
    });
  });
}

export async function aceptarTerminos(actor: UsuarioSesion, version: string): Promise<void> {
  const vigente = versionTerminosVigente();
  if (version !== vigente) {
    throw new ErrorApp('CONFLICTO', 'La versión de los términos cambió', {
      version_vigente: vigente,
    });
  }
  await enTransaccion(async (tx) => {
    await guardarAceptacionTerminos(tx, actor.id, version);
    await registrarAuditoria(tx, {
      accion: 'terminos_aceptados',
      usuario_id: actor.id,
      detalle: { version },
    });
  });
}

export async function listarSesiones(actor: UsuarioSesion): Promise<SesionSalidaDatos[]> {
  const filas: {
    id: string;
    origen: 'web' | 'bot';
    ip: string | null;
    user_agent: string | null;
    creada_en: Date;
    ultimo_uso: Date;
    expira_en: Date;
    mantener: boolean;
  }[] = await dataSource.query(
    `SELECT id, origen, host(ip) AS ip, user_agent, creada_en, ultimo_uso, expira_en, mantener
       FROM sesion WHERE usuario_id = $1
      ORDER BY (id = $2::uuid) DESC, ultimo_uso DESC`,
    [actor.id, actor.sesion_id],
  );
  return filas.map((f) => ({
    id: f.id,
    origen: f.origen,
    ip: f.ip,
    user_agent: f.user_agent,
    creada_en: f.creada_en.toISOString(),
    ultimo_uso: f.ultimo_uso.toISOString(),
    expira_en: f.expira_en.toISOString(),
    mantener: f.mantener,
    actual: f.id === actor.sesion_id,
  }));
}

export async function cerrarSesion(actor: UsuarioSesion, id: string): Promise<void> {
  await enTransaccion(async (tx: EntityManager) => {
    // TypeORM devuelve [filas, cantidad] en DELETE ... RETURNING
    const [borradas] = (await tx.query(
      `DELETE FROM sesion WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [id, actor.id],
    )) as [{ id: string }[], number];
    if (borradas.length === 0) throw new ErrorApp('NO_ENCONTRADO', 'Sesión no encontrada');
    await registrarAuditoria(tx, {
      accion: 'sesion_cerrada',
      usuario_id: actor.id,
      detalle: { sesion_id: id, motivo: 'usuario' },
    });
  });
}

export async function cerrarOtrasSesiones(actor: UsuarioSesion): Promise<number> {
  const cerradas = await enTransaccion((tx) =>
    cerrarSesionesDeUsuario(tx, actor.id, 'usuario', actor.sesion_id),
  );
  return cerradas.length;
}
