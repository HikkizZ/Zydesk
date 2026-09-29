export class ErrorApi extends Error {
  constructor(
    public codigo: string,
    mensaje: string,
    public status: number,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

export async function obtener<T>(ruta: string): Promise<T> {
  const res = await fetch(ruta, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    let codigo = 'INTERNO';
    let mensaje = `Error ${res.status}`;
    try {
      const cuerpo = (await res.json()) as { error?: { codigo?: string; mensaje?: string } };
      codigo = cuerpo.error?.codigo ?? codigo;
      mensaje = cuerpo.error?.mensaje ?? mensaje;
    } catch {
      // cuerpo no JSON: se conserva el mensaje por defecto
    }
    throw new ErrorApi(codigo, mensaje, res.status);
  }
  return (await res.json()) as T;
}
