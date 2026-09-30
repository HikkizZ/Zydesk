import { Router } from 'express';
import { z } from 'zod';
import {
  EventoSalida,
  LogoEntrada,
  MarcaEntrada,
  MarcaSalida,
  NumeracionEntrada,
  NumeracionSalida,
} from '@zydesk/shared';
import { actorRequerido } from '../../core/auth/requiere.js';
import { ruta } from '../../core/http/ruta.js';
import {
  guardarLogo,
  guardarMarca,
  guardarNumeracion,
  historialNumeracion,
  leerLogo,
  obtenerMarca,
  obtenerNumeracion,
  quitarLogo,
} from './configuracion.service.js';

export function crearRutasConfiguracion(): Router {
  const router = Router();

  ruta(router, {
    metodo: 'get',
    path: '/api/config/marca',
    resumen: 'Nombre y logo de la aplicación (público: lo usa la pantalla de ingreso)',
    etiqueta: 'Configuración',
    permiso: 'publico',
    respuesta: MarcaSalida,
    handler: async () => obtenerMarca(),
  });

  ruta(router, {
    metodo: 'put',
    path: '/api/config/marca',
    resumen: 'Cambiar el nombre visible de la aplicación',
    etiqueta: 'Configuración',
    permiso: 'config.editar',
    body: MarcaEntrada,
    respuesta: MarcaSalida,
    handler: async ({ actor, body }) => guardarMarca(actorRequerido(actor), body),
  });

  ruta(router, {
    metodo: 'put',
    path: '/api/config/logo',
    resumen: 'Guardar el logo (PNG, JPEG o SVG de hasta 200 KB en base64)',
    etiqueta: 'Configuración',
    permiso: 'config.editar',
    body: LogoEntrada,
    respuesta: MarcaSalida,
    handler: async ({ actor, body }) => guardarLogo(actorRequerido(actor), body),
  });

  ruta(router, {
    metodo: 'delete',
    path: '/api/config/logo',
    resumen: 'Quitar el logo',
    etiqueta: 'Configuración',
    permiso: 'config.editar',
    respuesta: MarcaSalida,
    handler: async ({ actor }) => quitarLogo(actorRequerido(actor)),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/config/logo',
    resumen: 'Logo en binario (público); 404 si no hay',
    etiqueta: 'Configuración',
    permiso: 'publico',
    respuesta: z.unknown(),
    handler: async ({ res }) => {
      const { tipo_mime, datos } = await leerLogo();
      res.setHeader('Content-Type', tipo_mime);
      res.setHeader('Cache-Control', 'no-cache');
      // Un SVG abierto directamente no debe poder ejecutar scripts.
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      );
      res.send(datos);
      return undefined;
    },
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/config/numeracion',
    resumen: 'Configuración de numeración de tickets y OT',
    etiqueta: 'Configuración',
    permiso: 'config.editar',
    respuesta: NumeracionSalida,
    handler: async () => obtenerNumeracion(),
  });

  ruta(router, {
    metodo: 'put',
    path: '/api/config/numeracion',
    resumen: 'Guardar la numeración (solo afecta a códigos futuros)',
    etiqueta: 'Configuración',
    permiso: 'config.editar',
    body: NumeracionEntrada,
    respuesta: NumeracionSalida,
    handler: async ({ actor, body }) => guardarNumeracion(actorRequerido(actor), body),
  });

  ruta(router, {
    metodo: 'get',
    path: '/api/config/numeracion/historial',
    resumen: 'Últimos 50 cambios de numeración',
    etiqueta: 'Configuración',
    permiso: 'config.editar',
    respuesta: z.array(EventoSalida),
    handler: async () => historialNumeracion(),
  });

  return router;
}
