import { Router, type RequestHandler } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import multer from 'multer';
import { z } from 'zod';
import { ArchivoSalida, ArchivosPendientesQuery } from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { ruta } from '../../core/http/ruta.js';
import {
  MAX_ARCHIVOS_POR_PETICION,
  MAX_TAMANO_ARCHIVO,
} from '../../integraciones/archivos/mime.js';
import { storage } from '../../integraciones/storage/storage.js';
import {
  listarPendientes,
  prepararDescarga,
  quitarPendiente,
  subirArchivos,
} from './archivos.service.js';

const paramsId = z.object({ id: z.coerce.number().int().positive() });

// Temporales en `os.tmpdir()`; `preservePath` para guardar `nombre_original` tal cual (nunca se usa en disco).
const multipart = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { files: MAX_ARCHIVOS_POR_PETICION, fileSize: MAX_TAMANO_ARCHIVO },
  preservePath: true,
}).array('archivos');

const recibirArchivos: RequestHandler = (req, res, next) => {
  multipart(req, res, (err: unknown) => {
    if (!err) {
      // busboy entrega el nombre como latin1; los navegadores lo envían en UTF-8
      for (const f of (req.files as Express.Multer.File[] | undefined) ?? []) {
        f.originalname = Buffer.from(f.originalname, 'latin1').toString('utf8');
      }
      return next();
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ErrorApp('ARCHIVO_MUY_GRANDE', 'El archivo supera los 20 MB'));
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(new ErrorApp('DEMASIADOS_ARCHIVOS', 'Máximo 10 archivos por subida'));
      }
    }
    next(new ErrorApp('VALIDACION', 'Datos inválidos', { archivos: ['Formulario inválido'] }));
  });
};

const borrarTemporales = (files: Express.Multer.File[]) =>
  Promise.all(files.map((f) => fs.promises.unlink(f.path).catch(() => undefined)));

// Nombre seguro para `filename=` (ASCII) y codificado para `filename*=` (RFC 5987).
function contentDisposition(disposicion: 'inline' | 'attachment', nombre: string): string {
  const ascii = nombre.replace(/[^\x20-\x7e]|["\\/;]/g, '_');
  const codificado = encodeURIComponent(nombre).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposicion}; filename="${ascii}"; filename*=UTF-8''${codificado}`;
}

export function crearRutasArchivos(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'post',
    path: '/api/archivos',
    resumen: 'Subir archivos (multipart, campo `archivos`, hasta 10 de 20 MB); quedan pendientes',
    etiqueta: 'Archivos',
    permiso: 'tickets.editar',
    previos: [recibirArchivos],
    respuesta: z.array(ArchivoSalida),
    status: 201,
    handler: async ({ actor, req }) => {
      const subidos = (req.files as Express.Multer.File[] | undefined) ?? [];
      try {
        return await subirArchivos(actorRequerido(actor), subidos);
      } finally {
        await borrarTemporales(subidos);
      }
    },
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/archivos/pendientes',
    resumen: 'Listar mis archivos pendientes (sin asociar)',
    etiqueta: 'Archivos',
    permiso: 'tickets.editar',
    query: ArchivosPendientesQuery,
    respuesta: z.array(ArchivoSalida),
    handler: async ({ actor }) => listarPendientes(actorRequerido(actor)),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/archivos/:id',
    resumen: 'Descargar un archivo (binario; inline para imágenes y PDF, attachment para el resto)',
    etiqueta: 'Archivos',
    permiso: 'sesion',
    params: paramsId,
    respuesta: z.unknown(),
    handler: async ({ actor, params, res }) => {
      const { archivo, disposicion } = await prepararDescarga(actorRequerido(actor), params.id);
      res.set({
        'Content-Type': archivo.tipo_mime,
        'Content-Length': String(archivo.tamano),
        'Content-Disposition': contentDisposition(disposicion, archivo.nombre_original),
        'Cache-Control': 'private, max-age=3600',
      });
      try {
        await pipeline(storage.abrir(archivo.clave), res);
      } catch (err) {
        if (!res.headersSent) throw err;
        res.destroy(); // cliente desconectado o lectura fallida a mitad de la respuesta
      }
      return undefined;
    },
  });

  ruta(router, {
    metodo: 'delete',
    path: '/api/archivos/:id',
    resumen: 'Quitar un archivo pendiente propio',
    etiqueta: 'Archivos',
    permiso: 'tickets.editar',
    params: paramsId,
    respuesta: z.void(),
    status: 204,
    handler: async ({ actor, params }) => quitarPendiente(actorRequerido(actor), params.id),
  });

  return router;
}
