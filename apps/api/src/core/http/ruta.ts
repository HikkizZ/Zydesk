import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import type { ZodType } from 'zod';
import { env } from '../../config/env.js';
import type { PermisoRuta, UsuarioSesion } from '../auth/tipos.js';
import { registrarRuta } from './openapi.js';
import { validar, type DatosValidados } from './validar.js';

export type { PermisoRuta, UsuarioSesion };

export interface DefRuta<P, Q, B, R> {
  metodo: 'get' | 'post' | 'put' | 'patch' | 'delete';
  // Ruta completa con prefijo, p. ej. '/api/salud' o '/api/clientes/:id'
  path: string;
  resumen: string;
  etiqueta: string;
  // 'publico' = sin sesión; 'sesion' = cualquier usuario autenticado; arreglo = cualquiera de ellos
  permiso?: PermisoRuta | PermisoRuta[];
  params?: ZodType<P> | undefined;
  query?: ZodType<Q> | undefined;
  body?: ZodType<B> | undefined;
  // Middlewares entre la autorización y la validación (único uso: `multer` en la subida multipart, ADR 0009)
  previos?: RequestHandler[];
  respuesta: ZodType<R>;
  status?: number;
  handler: (ctx: {
    params: P;
    query: Q;
    body: B;
    actor: UsuarioSesion | null;
    req: Request;
    res: Response;
  }) => Promise<R>;
}

// Pasos de seguridad que aporta el bloque 1B (core/auth). `ruta()` falla al registrar una ruta
// protegida si `requiere` no está definido: nunca deja una ruta abierta por omisión.
export interface PasosSeguridad {
  csrf?: RequestHandler;
  autenticar?: RequestHandler;
  requiere?: (permiso: PermisoRuta | PermisoRuta[]) => RequestHandler;
}
export const seguridad: PasosSeguridad = {};

// ADR 0010: única forma de declarar rutas.
export function ruta<P = unknown, Q = unknown, B = unknown, R = unknown>(
  router: Router,
  def: DefRuta<P, Q, B, R>,
): void {
  const permiso = def.permiso ?? 'sesion';
  const publico = permiso === 'publico';
  if (!publico && !seguridad.requiere) {
    throw new Error(`Ruta protegida sin 'requiere' configurado: ${def.metodo} ${def.path}`);
  }

  const cadena: RequestHandler[] = [];
  if (def.metodo !== 'get' && seguridad.csrf) cadena.push(seguridad.csrf);
  if (seguridad.autenticar) cadena.push(seguridad.autenticar);
  if (!publico && seguridad.requiere) cadena.push(seguridad.requiere(permiso));
  if (def.previos) cadena.push(...def.previos);
  cadena.push(validar({ params: def.params, query: def.query, body: def.body }));

  const ejecutar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const datos = res.locals['datos'] as DatosValidados<P, Q, B>;
      res.statusCode = def.status ?? 200; // el handler puede cambiarlo con res.status()
      const resultado = await def.handler({
        params: datos.params,
        query: datos.query,
        body: datos.body,
        actor: (res.locals['actor'] as UsuarioSesion | null | undefined) ?? null,
        req,
        res,
      });
      if (res.headersSent) return;
      const salida = env.NODE_ENV === 'production' ? resultado : def.respuesta.parse(resultado);
      if (res.statusCode === 204) res.end();
      else res.json(salida);
    } catch (err) {
      next(err);
    }
  };

  router[def.metodo](def.path, ...cadena, (req, res, next) => void ejecutar(req, res, next));

  registrarRuta({
    metodo: def.metodo,
    path: def.path,
    resumen: def.resumen,
    etiqueta: def.etiqueta,
    permiso,
    params: def.params,
    query: def.query,
    body: def.body,
    respuesta: def.respuesta,
    status: def.status ?? 200,
  });
}
