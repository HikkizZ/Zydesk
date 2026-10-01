export class ErrorApi extends Error {
  constructor(
    public codigo: string,
    mensaje: string,
    public status: number,
    public detalles?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

// 401 fuera del ingreso y de `GET /api/yo` (que el SesionProvider maneja solo): sesión vencida o cerrada.
export const EVENTO_NO_AUTENTICADO = 'zydesk:no-autenticado';

async function procesar<T>(ruta: string, res: Response): Promise<T> {
  if (!res.ok) {
    let codigo = 'INTERNO';
    let mensaje = `Error ${res.status}`;
    let detalles: Record<string, unknown> | undefined;
    try {
      const cuerpo = (await res.json()) as {
        error?: { codigo?: string; mensaje?: string; detalles?: Record<string, unknown> };
      };
      codigo = cuerpo.error?.codigo ?? codigo;
      mensaje = cuerpo.error?.mensaje ?? mensaje;
      detalles = cuerpo.error?.detalles;
    } catch {
      // cuerpo no JSON: se conserva el mensaje por defecto
    }
    if (res.status === 401 && ruta !== '/api/auth/ingresar' && ruta !== '/api/yo') {
      window.dispatchEvent(new Event(EVENTO_NO_AUTENTICADO));
    }
    throw new ErrorApi(codigo, mensaje, res.status, detalles);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function obtener<T>(ruta: string): Promise<T> {
  const res = await fetch(ruta, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  return procesar<T>(ruta, res);
}

// Toda mutación lleva X-Requested-With: Zydesk (protección CSRF, ADR 0018 punto 3).
export async function enviar<T>(
  metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  ruta: string,
  cuerpo?: unknown,
): Promise<T> {
  const res = await fetch(ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'Zydesk',
    },
    credentials: 'same-origin',
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return procesar<T>(ruta, res);
}

// Subida multipart: sin `Content-Type` manual (el navegador agrega el `boundary`).
export async function enviarMultipart<T>(ruta: string, formData: FormData): Promise<T> {
  const res = await fetch(ruta, {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Requested-With': 'Zydesk' },
    credentials: 'same-origin',
    body: formData,
  });
  return procesar<T>(ruta, res);
}

function nombreDeDescarga(cabecera: string | null): string | null {
  if (!cabecera) return null;
  const codificado = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cabecera)?.[1];
  if (codificado) {
    try {
      return decodeURIComponent(codificado.trim());
    } catch {
      // se prueba con `filename`
    }
  }
  return /filename\s*=\s*"([^"]+)"/i.exec(cabecera)?.[1] ?? null;
}

// Descarga un binario `attachment` (spec fase 4 §11.1): el nombre sale del `Content-Disposition`.
// Los errores JSON pasan por `procesar`, como en cualquier otra petición.
export async function descargar(ruta: string): Promise<void> {
  const res = await fetch(ruta, { credentials: 'same-origin' });
  if (!res.ok) return procesar<void>(ruta, res);
  const nombre = nombreDeDescarga(res.headers.get('Content-Disposition')) ?? 'descarga';
  const url = URL.createObjectURL(await res.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

// Arma `?a=1&b=2` omitiendo valores vacíos; para los filtros de las listas.
export function conQuery(
  ruta: string,
  params: Record<string, string | number | boolean | undefined>,
) {
  const q = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== '') q.set(clave, String(valor));
  }
  const texto = q.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}
