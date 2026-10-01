import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { descargar, ErrorApi } from './api';

let clicks: { href: string; download: string }[] = [];

beforeEach(() => {
  clicks = [];
  URL.createObjectURL = vi.fn(() => 'blob:prueba');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function responder(cabecera: string | null, estado = 200, cuerpo: BodyInit = 'datos') {
  const headers = new Headers();
  if (cabecera) headers.set('Content-Disposition', cabecera);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(cuerpo, { status: estado, headers })),
  );
}

it('toma el nombre de filename* (UTF-8) del Content-Disposition', async () => {
  responder(`attachment; filename="COT-0218_v1.xlsx"; filename*=UTF-8''COT-0218_v1.xlsx`);
  await descargar('/api/cotizaciones/1/descargar.xlsx');
  expect(clicks).toHaveLength(1);
  expect(clicks[0]?.download).toBe('COT-0218_v1.xlsx');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prueba');
});

it('decodifica filename* y cae a filename si no existe', async () => {
  responder(`attachment; filename="Cotizacion_x.pdf"; filename*=UTF-8''Cotizaci%C3%B3n.pdf`);
  await descargar('/x');
  expect(clicks[0]?.download).toBe('Cotización.pdf');

  responder('attachment; filename="COT-0218_v2-BORRADOR.pdf"');
  await descargar('/x');
  expect(clicks[1]?.download).toBe('COT-0218_v2-BORRADOR.pdf');
});

it('sin Content-Disposition usa un nombre genérico', async () => {
  responder(null);
  await descargar('/x');
  expect(clicks[0]?.download).toBe('descarga');
});

it('pide con credentials same-origin', async () => {
  responder(`attachment; filename="a.pdf"`);
  await descargar('/api/cotizaciones/1/descargar.pdf');
  const [ruta, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
    string,
    RequestInit,
  ];
  expect(ruta).toBe('/api/cotizaciones/1/descargar.pdf');
  expect(init.credentials).toBe('same-origin');
});

it('un error JSON se lanza como ErrorApi y no descarga nada', async () => {
  responder(
    null,
    404,
    JSON.stringify({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Cotización no encontrada' } }),
  );
  await expect(descargar('/x')).rejects.toMatchObject({
    codigo: 'NO_ENCONTRADO',
    status: 404,
  });
  await expect(descargar('/x')).rejects.toBeInstanceOf(ErrorApi);
  expect(clicks).toHaveLength(0);
});
