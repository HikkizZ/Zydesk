import type { ArchivoSalida } from '@zydesk/shared';
import type { z } from 'zod';
import { In, IsNull, type EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarAuditoria } from '../../core/historial/auditoria.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import {
  categoriaDe,
  detectarMime,
  detectarMimeBuffer,
  MAX_TAMANO_ARCHIVO,
  type MimeDetectado,
} from '../../integraciones/archivos/mime.js';
import { msgLegible } from '../../integraciones/correo/index.js';
import { storage } from '../../integraciones/storage/storage.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { Archivo } from './archivo.entity.js';

export type ArchivoSalidaDatos = z.infer<typeof ArchivoSalida>;

export interface DestinoArchivo {
  entidad: 'ticket';
  entidad_id: number;
  mensaje_id?: number;
}

// ---------------------------------------------------------------------------------------------
// Salidas (API para otros módulos)
// ---------------------------------------------------------------------------------------------

export function aSalida(
  fila: Archivo,
  subido_por: { id: number; nombre: string } | null,
): ArchivoSalidaDatos {
  return {
    id: fila.id,
    nombre_original: fila.nombre_original,
    tipo_mime: fila.tipo_mime,
    tamano: fila.tamano,
    categoria: fila.categoria,
    url: `/api/archivos/${fila.id}`,
    es_imagen: fila.tipo_mime.startsWith('image/'),
    subido_por,
    subido_en: fila.subido_en.toISOString(),
    origen_correo: fila.origen_correo_id !== null,
  };
}

// Resuelve los autores de todas las filas con una sola consulta.
export async function aSalidas(m: EntityManager, filas: Archivo[]): Promise<ArchivoSalidaDatos[]> {
  const ids = [...new Set(filas.map((f) => f.subido_por).filter((v): v is number => v !== null))];
  const usuarios =
    ids.length > 0
      ? await m.find(Usuario, { where: { id: In(ids) }, select: ['id', 'nombre'] })
      : [];
  const nombres = new Map(usuarios.map((u) => [u.id, u.nombre]));
  return filas.map((f) =>
    aSalida(
      f,
      f.subido_por !== null
        ? { id: f.subido_por, nombre: nombres.get(f.subido_por) ?? 'Usuario' }
        : null,
    ),
  );
}

// Archivos propios del ticket: sin los de mensajes, sin el original del correo (va en `correo.archivo`)
// y sin los adjuntos extraídos del correo (van en `correo.adjuntos`, ver `archivosDeCorreo`).
export async function archivosDe(
  m: EntityManager,
  entidad: 'ticket',
  entidad_id: number,
): Promise<ArchivoSalidaDatos[]> {
  const filas = await m
    .createQueryBuilder(Archivo, 'a')
    .where('a.entidad = :entidad AND a.entidad_id = :entidad_id', { entidad, entidad_id })
    .andWhere('a.mensaje_id IS NULL AND a.origen_correo_id IS NULL')
    .andWhere(
      `a.id NOT IN (SELECT c.archivo_id FROM correo_adjunto c
                     WHERE c.ticket_id = :entidad_id AND c.archivo_id IS NOT NULL)`,
    )
    .orderBy('a.id', 'ASC')
    .getMany();
  return aSalidas(m, filas);
}

// Adjuntos internos extraídos de un correo (`archivo.origen_correo_id`).
export async function archivosDeCorreo(
  m: EntityManager,
  correo_adjunto_id: number,
): Promise<ArchivoSalidaDatos[]> {
  const filas = await m.find(Archivo, {
    where: { origen_correo_id: correo_adjunto_id },
    order: { id: 'ASC' },
  });
  return aSalidas(m, filas);
}

export async function archivoDeId(
  m: EntityManager,
  id: number,
): Promise<ArchivoSalidaDatos | null> {
  const fila = await m.findOneBy(Archivo, { id });
  return fila ? (await aSalidas(m, [fila]))[0]! : null;
}

// Por mensaje: clave = `mensaje_id`; los mensajes sin archivos no aparecen en el mapa.
export async function archivosDeMensajes(
  m: EntityManager,
  mensaje_ids: number[],
): Promise<Map<number, ArchivoSalidaDatos[]>> {
  const porMensaje = new Map<number, ArchivoSalidaDatos[]>();
  if (mensaje_ids.length === 0) return porMensaje;
  const filas = await m.find(Archivo, {
    where: { mensaje_id: In(mensaje_ids) },
    order: { id: 'ASC' },
  });
  const salidas = await aSalidas(m, filas);
  filas.forEach((f, i) => {
    const lista = porMensaje.get(f.mensaje_id!) ?? [];
    lista.push(salidas[i]!);
    porMensaje.set(f.mensaje_id!, lista);
  });
  return porMensaje;
}

// ---------------------------------------------------------------------------------------------
// Asociación de pendientes
// ---------------------------------------------------------------------------------------------

// Todos deben existir, estar pendientes y ser del actor; si no, 400 VALIDACION (no revela de quién son).
export async function asociarArchivos(
  tx: EntityManager,
  ids: number[],
  destino: DestinoArchivo,
  actor: Pick<UsuarioSesion, 'id'>,
): Promise<void> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return;
  const filas = await tx.find(Archivo, {
    where: { id: In(unicos) },
    lock: { mode: 'pessimistic_write' },
  });
  const validos =
    filas.length === unicos.length &&
    filas.every((f) => f.entidad === null && f.subido_por === actor.id);
  if (!validos) {
    throw new ErrorApp('VALIDACION', 'Datos inválidos', { archivo_ids: ['Archivo no disponible'] });
  }
  await tx.update(
    Archivo,
    { id: In(unicos) },
    {
      entidad: destino.entidad,
      entidad_id: destino.entidad_id,
      mensaje_id: destino.mensaje_id ?? null,
    },
  );
}

// ---------------------------------------------------------------------------------------------
// Archivos desde memoria (adjuntos extraídos de un correo, texto pegado)
// ---------------------------------------------------------------------------------------------

export async function eliminarDeDisco(claves: string[]): Promise<void> {
  await Promise.all(
    claves.map((c) =>
      storage
        .eliminar(c)
        .catch((err: unknown) => logger.warn({ err }, 'no se pudo borrar archivo')),
    ),
  );
}

// Guarda `contenido` en el Storage e inserta la fila. Sin `tipo` se valida con `detectarMimeBuffer`
// y el límite de 20 MB (→ 400 ARCHIVO_NO_PERMITIDO { nombre }); con `tipo` (p. ej. el `.txt` del texto
// pegado) se usa tal cual. Si la transacción del llamador se revierte, debe borrar el disco con
// `eliminarDeDisco([archivo.clave])`.
export async function guardarBufferComoArchivo(
  tx: EntityManager,
  datos: {
    contenido: Buffer;
    nombre_original: string;
    subido_por: number | null;
    destino?: DestinoArchivo;
    origen_correo_id?: number | null;
    tipo?: MimeDetectado;
    // Por defecto se deduce del MIME (`categoriaDe`); el texto pegado de un correo fuerza `correo`
    categoria?: Archivo['categoria'];
  },
): Promise<Archivo> {
  let tipo = datos.tipo;
  if (!tipo) {
    const noPermitido = () =>
      new ErrorApp('ARCHIVO_NO_PERMITIDO', 'Tipo de archivo no permitido', {
        nombre: datos.nombre_original,
      });
    if (datos.contenido.length === 0 || datos.contenido.length > MAX_TAMANO_ARCHIVO) {
      throw noPermitido();
    }
    tipo = await detectarMimeBuffer(datos.contenido, datos.nombre_original);
  }
  const clave = await storage.guardar(datos.contenido, tipo.ext);
  try {
    return await tx.save(Archivo, {
      entidad: datos.destino?.entidad ?? null,
      entidad_id: datos.destino?.entidad_id ?? null,
      mensaje_id: datos.destino?.mensaje_id ?? null,
      categoria: datos.categoria ?? categoriaDe(tipo.tipo_mime),
      nombre_original: datos.nombre_original,
      tipo_mime: tipo.tipo_mime,
      tamano: datos.contenido.length,
      clave,
      origen_correo_id: datos.origen_correo_id ?? null,
      subido_por: datos.subido_por,
    });
  } catch (err) {
    await eliminarDeDisco([clave]);
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------------------------

export interface ArchivoSubido {
  path: string;
  originalname: string;
  size: number;
}

// Todo o nada: valida todos, los mueve al Storage y los inserta en una transacción.
export async function subirArchivos(
  actor: UsuarioSesion,
  subidos: ArchivoSubido[],
): Promise<ArchivoSalidaDatos[]> {
  if (subidos.length === 0) {
    throw new ErrorApp('VALIDACION', 'Datos inválidos', {
      archivos: ['Adjunta al menos un archivo'],
    });
  }
  const tipos: MimeDetectado[] = [];
  for (const s of subidos) {
    const noPermitido = () =>
      new ErrorApp('ARCHIVO_NO_PERMITIDO', 'Tipo de archivo no permitido', {
        nombre: s.originalname,
      });
    if (s.size === 0) throw noPermitido();
    const tipo = await detectarMime(s.path, s.originalname);
    // `x-cfb` solo vale como .msg si la librería logra abrirlo (spec fase-2 §2)
    if (tipo.tipo_mime === 'application/vnd.ms-outlook' && !(await msgLegible(s.path))) {
      throw noPermitido();
    }
    tipos.push(tipo);
  }

  const claves: string[] = [];
  try {
    for (const [i, s] of subidos.entries())
      claves.push(await storage.guardar(s.path, tipos[i]!.ext));
    const filas = await enTransaccion((tx) =>
      tx.save(
        Archivo,
        subidos.map((s, i) => ({
          entidad: null,
          entidad_id: null,
          mensaje_id: null,
          categoria: categoriaDe(tipos[i]!.tipo_mime),
          nombre_original: s.originalname,
          tipo_mime: tipos[i]!.tipo_mime,
          tamano: s.size,
          clave: claves[i]!,
          origen_correo_id: null,
          subido_por: actor.id,
        })),
      ),
    );
    logger.info({ usuario_id: actor.id, archivo_ids: filas.map((f) => f.id) }, 'archivos subidos');
    return aSalidas(dataSource.manager, filas);
  } catch (err) {
    await eliminarDeDisco(claves);
    throw err;
  }
}

export async function listarPendientes(actor: UsuarioSesion): Promise<ArchivoSalidaDatos[]> {
  const filas = await dataSource.manager.find(Archivo, {
    where: { entidad: IsNull(), subido_por: actor.id },
    order: { id: 'ASC' },
  });
  return aSalidas(dataSource.manager, filas);
}

// Solo pendientes propios; cualquier otro caso es 404 (no revela existencia).
export async function quitarPendiente(actor: UsuarioSesion, id: number): Promise<void> {
  const clave = await enTransaccion(async (tx) => {
    const fila = await tx.findOne(Archivo, {
      where: { id, entidad: IsNull(), subido_por: actor.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!fila) throw new ErrorApp('NO_ENCONTRADO', 'Archivo no encontrado');
    await tx.delete(Archivo, { id });
    return fila.clave;
  });
  await eliminarDeDisco([clave]);
}

export interface DescargaArchivo {
  archivo: Archivo;
  disposicion: 'inline' | 'attachment';
}

// Pendiente → solo quien lo subió; asociado a un ticket → cualquier usuario autenticado (B10).
// Audita `descarga_archivo` solo cuando se sirve como `attachment` (spec fase-2 §4.4).
export async function prepararDescarga(actor: UsuarioSesion, id: number): Promise<DescargaArchivo> {
  const archivo = await dataSource.manager.findOneBy(Archivo, { id });
  if (!archivo || (archivo.entidad === null && archivo.subido_por !== actor.id)) {
    throw new ErrorApp('NO_ENCONTRADO', 'Archivo no encontrado');
  }
  if (!(await storage.existe(archivo.clave))) {
    logger.error({ archivo_id: archivo.id }, 'archivo sin contenido en disco');
    throw new ErrorApp('NO_ENCONTRADO', 'Archivo no encontrado');
  }
  const inline = archivo.tipo_mime.startsWith('image/') || archivo.tipo_mime === 'application/pdf';
  if (!inline) {
    await enTransaccion((tx) =>
      registrarAuditoria(tx, {
        accion: 'descarga_archivo',
        usuario_id: actor.id,
        detalle: {
          archivo_id: archivo.id,
          entidad: archivo.entidad,
          entidad_id: archivo.entidad_id,
        },
      }),
    );
  }
  return { archivo, disposicion: inline ? 'inline' : 'attachment' };
}
