import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { archivoDePrueba } from '../../../test/fabricas.js';
import { categoriaDe, detectarMime, detectarMimeBuffer, permitidoPorExtension } from './mime.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zydesk-mime-test-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function escribir(contenido: Buffer | string): string {
  const ruta = path.join(tmp, `${Math.random().toString(36).slice(2)}.tmp`);
  fs.writeFileSync(ruta, contenido);
  return ruta;
}

describe('detectarMime', () => {
  it.each([
    ['foto.jpg', 'foto.jpg', 'image/jpeg', '.jpg'],
    ['doc.pdf', 'informe.PDF', 'application/pdf', '.pdf'],
    ['correo.eml', 'Correo.EML', 'message/rfc822', '.eml'],
    ['correo.txt', 'nota.txt', 'text/plain', '.txt'],
  ])('%s como %s', async (fixture, nombre, mime, ext) => {
    const r = await detectarMime(escribir(archivoDePrueba(fixture)), nombre);
    expect(r).toEqual({ tipo_mime: mime, ext });
  });

  it('la extensión en disco sale del MIME detectado, no del nombre del usuario', async () => {
    const r = await detectarMime(escribir(archivoDePrueba('foto.jpg')), 'foto.pdf');
    expect(r).toEqual({ tipo_mime: 'image/jpeg', ext: '.jpg' });
  });

  it('CSV solo por extensión y contenido textual', async () => {
    const r = await detectarMime(escribir('a,b\n1,2\n'), 'datos.csv');
    expect(r).toEqual({ tipo_mime: 'text/csv', ext: '.csv' });
  });

  it('rechaza un ejecutable con extensión de imagen o PDF', async () => {
    for (const nombre of ['no-es-imagen.png', 'falso.pdf']) {
      await expect(
        detectarMime(escribir(archivoDePrueba('no-es-imagen.png')), nombre),
      ).rejects.toMatchObject({ codigo: 'ARCHIVO_NO_PERMITIDO', detalles: { nombre } });
    }
  });

  it('rechaza .eml/.txt/.csv con bytes nulos, y texto con extensión no textual', async () => {
    await expect(
      detectarMime(escribir(Buffer.from('From: a\0b')), 'malo.eml'),
    ).rejects.toMatchObject({ codigo: 'ARCHIVO_NO_PERMITIDO' });
    await expect(detectarMime(escribir('hola'), 'nota.pdf')).rejects.toMatchObject({
      codigo: 'ARCHIVO_NO_PERMITIDO',
    });
    await expect(detectarMime(escribir('hola'), 'sin-extension')).rejects.toMatchObject({
      codigo: 'ARCHIVO_NO_PERMITIDO',
    });
  });

  it('un contenedor CFB solo vale como .msg/.doc/.xls', async () => {
    const cfb = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(600),
    ]);
    expect((await detectarMimeBuffer(cfb, 'correo.msg')).tipo_mime).toBe(
      'application/vnd.ms-outlook',
    );
    await expect(detectarMimeBuffer(cfb, 'cosa.bin')).rejects.toMatchObject({
      codigo: 'ARCHIVO_NO_PERMITIDO',
    });
  });
});

describe('categoriaDe y permitidoPorExtension', () => {
  it('clasifica por MIME', () => {
    expect(categoriaDe('image/png')).toBe('foto');
    expect(categoriaDe('message/rfc822')).toBe('correo');
    expect(categoriaDe('application/vnd.ms-outlook')).toBe('correo');
    expect(categoriaDe('application/pdf')).toBe('documento');
  });

  it('vista previa de adjuntos: lista por extensión y tamaño ≤ 20 MB', () => {
    expect(permitidoPorExtension('captura.png', 1000)).toBe(true);
    expect(permitidoPorExtension('informe.PDF', 1000)).toBe(true);
    expect(permitidoPorExtension('programa.exe', 1000)).toBe(false);
    expect(permitidoPorExtension('captura.png', 20 * 1024 * 1024 + 1)).toBe(false);
    expect(permitidoPorExtension('vacio.png', 0)).toBe(false);
  });
});
