import { Router } from 'express';
import { z } from 'zod';
import {
  AceptarTerminosEntrada,
  CambiarContrasenaEntrada,
  IngresoEntrada,
  SesionSalida,
  YoSalida,
} from '@zydesk/shared';
import { fijarCookie, borrarCookie } from '../../core/auth/cookie.js';
import { ipReal } from '../../core/auth/ip.js';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import {
  aceptarTerminos,
  cambiarContrasena,
  cerrarOtrasSesiones,
  cerrarSesion,
  construirYo,
  ingresar,
  listarSesiones,
  salir,
} from './auth.service.js';

const sinCuerpo = z.void();

export function crearRutasAuth(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'post',
    path: '/api/auth/ingresar',
    resumen: 'Ingresar con correo y contraseña',
    etiqueta: 'Autenticación',
    permiso: 'publico',
    body: IngresoEntrada,
    respuesta: YoSalida,
    handler: async ({ body, req, res }) => {
      const { sesion, yo } = await ingresar(body, ipReal(req), req.header('user-agent') ?? null);
      fijarCookie(req, res, sesion.token, sesion);
      return yo;
    },
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/auth/salir',
    resumen: 'Cerrar la sesión actual',
    etiqueta: 'Autenticación',
    permiso: 'sesion',
    respuesta: sinCuerpo,
    status: 204,
    handler: async ({ actor, req, res }) => {
      await salir(actorRequerido(actor));
      borrarCookie(req, res);
    },
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/yo',
    resumen: 'Datos de la persona autenticada',
    etiqueta: 'Yo',
    permiso: 'sesion',
    respuesta: YoSalida,
    handler: async ({ actor }) => construirYo(actorRequerido(actor).id),
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/yo/cambiar-contrasena',
    resumen: 'Cambiar la contraseña (cierra las demás sesiones)',
    etiqueta: 'Yo',
    permiso: 'sesion',
    body: CambiarContrasenaEntrada,
    respuesta: sinCuerpo,
    status: 204,
    handler: async ({ actor, body, req, res }) => {
      const sesion = await cambiarContrasena(
        actorRequerido(actor),
        body,
        ipReal(req),
        req.header('user-agent') ?? null,
      );
      fijarCookie(req, res, sesion.token, sesion);
    },
  });

  ruta(router, {
    metodo: 'post',
    path: '/api/yo/aceptar-terminos',
    resumen: 'Aceptar la versión vigente de los términos',
    etiqueta: 'Yo',
    permiso: 'sesion',
    body: AceptarTerminosEntrada,
    respuesta: YoSalida,
    handler: async ({ actor, body }) => {
      const a = actorRequerido(actor);
      await aceptarTerminos(a, body.version);
      return construirYo(a.id);
    },
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/yo/sesiones',
    resumen: 'Sesiones activas de la persona',
    etiqueta: 'Yo',
    permiso: 'sesion',
    respuesta: z.array(SesionSalida),
    handler: async ({ actor }) => listarSesiones(actorRequerido(actor)),
  });

  ruta(router, {
    metodo: 'delete',
    path: '/api/yo/sesiones/:id',
    resumen: 'Cerrar una sesión propia',
    etiqueta: 'Yo',
    permiso: 'sesion',
    params: z.object({ id: z.string().uuid() }),
    respuesta: sinCuerpo,
    status: 204,
    handler: async ({ actor, params }) => {
      await cerrarSesion(actorRequerido(actor), params.id);
    },
  });

  ruta(router, {
    metodo: 'delete',
    path: '/api/yo/sesiones',
    resumen: 'Cerrar todas las sesiones propias menos la actual',
    etiqueta: 'Yo',
    permiso: 'sesion',
    respuesta: z.object({ cerradas: z.number().int() }),
    handler: async ({ actor }) => ({ cerradas: await cerrarOtrasSesiones(actorRequerido(actor)) }),
  });

  return router;
}
