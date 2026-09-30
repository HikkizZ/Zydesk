import type { RequestHandler } from 'express';
import { z, type ZodType } from 'zod';
import { ErrorApp } from '../errores/error-app.js';

export interface DatosValidados<P = unknown, Q = unknown, B = unknown> {
  params: P;
  query: Q;
  body: B;
}

// Express 5 no permite reasignar `req.query`: los datos parseados van en `res.locals.datos`.
export function validar<P, Q, B>(esq: {
  params?: ZodType<P> | undefined;
  query?: ZodType<Q> | undefined;
  body?: ZodType<B> | undefined;
}): RequestHandler {
  return (req, res, next) => {
    const fuentes: (readonly [string, ZodType | undefined, unknown])[] = [
      ['params', esq.params, req.params],
      ['query', esq.query, req.query],
      ['body', esq.body, req.body],
    ];
    const datos: Record<string, unknown> = {};
    const errores: Record<string, string[]> = {};
    for (const [nombre, esquema, valor] of fuentes) {
      if (!esquema) {
        datos[nombre] = valor;
        continue;
      }
      const r = esquema.safeParse(valor);
      if (r.success) {
        datos[nombre] = r.data;
        continue;
      }
      for (const [campo, msgs] of Object.entries(z.flattenError(r.error).fieldErrors)) {
        (errores[campo] ??= []).push(...((msgs as string[] | undefined) ?? []));
      }
      // errores sin campo (p. ej. refinamientos de objeto o cuerpo que no es objeto)
      const generales = z.flattenError(r.error).formErrors;
      if (generales.length > 0) (errores[nombre] ??= []).push(...generales);
    }
    if (Object.keys(errores).length > 0) {
      next(new ErrorApp('VALIDACION', 'Datos inválidos', errores));
      return;
    }
    res.locals['datos'] = datos as unknown as DatosValidados<P, Q, B>;
    next();
  };
}
