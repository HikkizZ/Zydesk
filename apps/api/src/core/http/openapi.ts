import { createDocument } from 'zod-openapi';
import { z, type ZodObject, type ZodType } from 'zod';
import { VERSION } from '../../config/version.js';
import { NOMBRE_COOKIE } from '../auth/cookie.js';

export interface RutaRegistrada {
  metodo: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  resumen: string;
  etiqueta: string;
  permiso: string | string[];
  params: ZodType | undefined;
  query: ZodType | undefined;
  body: ZodType | undefined;
  respuesta: ZodType;
  status: number;
}

// Registro en memoria: se reemplaza la entrada si la ruta se declara de nuevo (p. ej. `crearApp` en tests).
const registro = new Map<string, RutaRegistrada>();

export function registrarRuta(r: RutaRegistrada): void {
  registro.set(`${r.metodo.toUpperCase()} ${r.path}`, r);
}

export function rutasRegistradas(): string[] {
  return [...registro.keys()];
}

export function metadatosRutas(): RutaRegistrada[] {
  return [...registro.values()];
}

const esquemaError = z.object({
  error: z.object({
    codigo: z.string(),
    mensaje: z.string(),
    detalles: z.unknown().optional(),
  }),
});

function aPathOpenApi(path: string): string {
  return path.replace(/^\/api(?=\/)/, '').replace(/:(\w+)/g, '{$1}');
}

const DESCRIPCION_ERROR: Record<number, string> = {
  400: 'Datos inválidos',
  401: 'No autenticado',
  403: 'Sin permiso',
  404: 'No encontrado',
  409: 'Conflicto',
};

// Construye el documento con el tipo que espera `createDocument`; las rutas ya validaron sus esquemas.
export type DocumentoOpenApi = ReturnType<typeof createDocument>;

export function generarDocumento(): DocumentoOpenApi {
  const paths: Record<string, Record<string, unknown>> = {};
  // comparación por punto de código: el orden no depende del locale de la máquina
  const clave = (r: RutaRegistrada) => `${r.path} ${r.metodo}`;
  const ordenadas = metadatosRutas().sort((a, b) => (clave(a) < clave(b) ? -1 : 1));
  for (const r of ordenadas) {
    const publico = r.permiso === 'publico';
    const permisoTexto = Array.isArray(r.permiso) ? r.permiso.join(' o ') : r.permiso;
    const errores = [
      ...(r.params || r.query || r.body ? [400] : []),
      ...(publico ? [] : [401, 403]),
      ...(r.params ? [404] : []),
      ...(r.metodo === 'get' ? [] : [409]),
    ];
    const responses: Record<string, unknown> = {
      [String(r.status)]:
        r.status === 204
          ? { description: 'Sin contenido' }
          : {
              description: 'Respuesta correcta',
              content: { 'application/json': { schema: r.respuesta } },
            },
    };
    for (const e of errores) {
      responses[String(e)] = {
        description: DESCRIPCION_ERROR[e],
        content: { 'application/json': { schema: esquemaError } },
      };
    }
    const operacion: Record<string, unknown> = {
      summary: r.resumen,
      description: `Permiso: ${permisoTexto}`,
      tags: [r.etiqueta],
      responses,
    };
    if (r.params || r.query) {
      operacion['requestParams'] = {
        ...(r.params && { path: r.params as ZodObject }),
        ...(r.query && { query: r.query as ZodObject }),
      };
    }
    if (r.body) {
      operacion['requestBody'] = { content: { 'application/json': { schema: r.body } } };
    }
    (paths[aPathOpenApi(r.path)] ??= {})[r.metodo] = operacion;
  }

  return createDocument({
    openapi: '3.1.0',
    info: { title: 'Zydesk API', version: VERSION },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        cookie: { type: 'apiKey', in: 'cookie', name: NOMBRE_COOKIE },
        bearer: { type: 'http', scheme: 'bearer' },
      },
    },
    paths: paths as never,
  });
}
