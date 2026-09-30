import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { archivoDePrueba } from '../../../test/fabricas.js';
import { leerEml, leerMsg, leerTexto, solicitanteDesde } from './index.js';
import { normalizarCuerpo } from './tipos.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zydesk-correo-test-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function escribir(nombre: string, contenido: Buffer | string): string {
  const ruta = path.join(tmp, nombre);
  fs.writeFileSync(ruta, contenido);
  return ruta;
}

describe('solicitanteDesde', () => {
  it.each([
    ['Paula Herrera <p@x.cl>', { nombre: 'Paula Herrera', correo: 'p@x.cl' }],
    ['"Herrera, Paula" <p@x.cl>', { nombre: 'Herrera, Paula', correo: 'p@x.cl' }],
    ['p@x.cl', { nombre: null, correo: 'p@x.cl' }],
    ['<p@x.cl>', { nombre: null, correo: 'p@x.cl' }],
    ['p@x.cl <p@x.cl>', { nombre: null, correo: 'p@x.cl' }],
    ['Paula Herrera', { nombre: 'Paula Herrera', correo: null }],
    ['Ana <a@x.cl>, Beto <b@x.cl>', { nombre: 'Ana', correo: 'a@x.cl' }],
    ['   ', { nombre: null, correo: null }],
    [null, { nombre: null, correo: null }],
  ])('%j', (de, esperado) => {
    expect(solicitanteDesde(de)).toEqual(esperado);
  });
});

describe('leerTexto', () => {
  it('reconoce De/Para/Enviado/Asunto y deja el resto como cuerpo (fecha en español → null)', () => {
    const r = leerTexto(archivoDePrueba('correo.txt').toString('utf8'));
    expect(r.origen).toBe('texto');
    expect(r.de).toBe('Paula Herrera <pherrera@ejemplo.test>');
    expect(r.para).toBe('Soporte Zydesk <soporte@zydesk.test>');
    expect(r.asunto).toBe('Error al emitir facturas desde el ERP');
    expect(r.fecha).toBeNull();
    expect(r.cuerpo_texto.startsWith('Hola equipo,')).toBe(true);
    expect(r.cuerpo_texto).not.toContain('Asunto:');
    expect(r.adjuntos).toEqual([]);
  });

  it('acepta From/To/Sent/Subject en inglés, insensible a mayúsculas, y una fecha ISO', () => {
    const r = leerTexto(
      'FROM: A <a@x.cl>\nto: b@x.cl\nDate: 2026-09-29T16:45:00-03:00\nsubject: Hola\n\nCuerpo',
    );
    expect(r.de).toBe('A <a@x.cl>');
    expect(r.para).toBe('b@x.cl');
    expect(r.asunto).toBe('Hola');
    expect(r.fecha?.toISOString()).toBe('2026-09-29T19:45:00.000Z');
    expect(r.cuerpo_texto).toBe('Cuerpo');
  });

  it('sin dos puntos no es una etiqueta; solo se miran las primeras 15 líneas', () => {
    const sinPuntos = leerTexto('De Paula\nAsunto Prueba\nHola');
    expect(sinPuntos.de).toBeNull();
    expect(sinPuntos.cuerpo_texto).toBe('De Paula\nAsunto Prueba\nHola');

    const lejos = leerTexto([...Array<string>(15).fill('relleno'), 'Asunto: tarde'].join('\n'));
    expect(lejos.asunto).toBeNull();
    expect(lejos.cuerpo_texto).toContain('Asunto: tarde');
  });

  it('solo cuenta la primera aparición de cada campo y normaliza \\r\\n', () => {
    const r = leerTexto('Asunto: uno\r\nAsunto: dos\r\n\r\nTexto   \r\n');
    expect(r.asunto).toBe('uno');
    expect(r.cuerpo_texto).toBe('Asunto: dos\n\nTexto');
  });
});

describe('normalizarCuerpo', () => {
  it('corta a 20 000 caracteres con "…"', () => {
    const r = normalizarCuerpo('a'.repeat(25_000));
    expect(r).toHaveLength(20_000);
    expect(r.endsWith('…')).toBe(true);
  });
});

describe('leerEml', () => {
  it('correo.eml: cabeceras, cuerpo y adjunto captura.png', async () => {
    const r = await leerEml(escribir('correo.eml', archivoDePrueba('correo.eml')));
    expect(r.origen).toBe('eml');
    expect(r.de).toBe('Paula Herrera <pherrera@ejemplo.test>');
    expect(r.para).toContain('soporte@zydesk.test');
    expect(r.asunto).toBe('Error al emitir facturas desde el ERP');
    expect(r.fecha?.toISOString()).toBe('2026-09-29T19:45:00.000Z');
    expect(r.cuerpo_texto).toContain('Desde esta mañana el ERP');
    expect(r.adjuntos).toHaveLength(1);
    const [adj] = r.adjuntos;
    expect(adj).toMatchObject({ indice: 0, nombre: 'captura.png', tipo_mime: 'image/png' });
    const contenido = await adj!.contenido();
    expect(contenido.subarray(1, 4).toString()).toBe('PNG');
    expect(adj!.tamano).toBe(contenido.length);
  });

  it('correo-html.eml: cuerpo a texto plano, sin etiquetas ni URL de enlaces ni imágenes', async () => {
    const r = await leerEml(escribir('html.eml', archivoDePrueba('correo-html.eml')));
    expect(r.asunto).toBe('Impresora de bodega sin conexión');
    expect(r.cuerpo_texto).toContain('La impresora de bodega no responde');
    expect(r.cuerpo_texto).toContain('el manual');
    expect(r.cuerpo_texto).not.toMatch(/<|https?:/);
    expect(r.adjuntos).toEqual([]);
  });

  it('html con <script>: el cuerpo no conserva etiquetas', async () => {
    const eml = [
      'From: X <x@ejemplo.test>',
      'Subject: Prueba',
      'Content-Type: text/html; charset="utf-8"',
      '',
      '<p>Hola</p><script>alert(1)</script><b>fin</b>',
    ].join('\r\n');
    const r = await leerEml(escribir('script.eml', eml));
    expect(r.cuerpo_texto).not.toContain('<');
    expect(r.cuerpo_texto).toContain('Hola');
  });

  it('las imágenes inline referenciadas por cid no son adjuntos', async () => {
    const eml = [
      'From: X <x@ejemplo.test>',
      'Subject: Con logo',
      'MIME-Version: 1.0',
      'Content-Type: multipart/related; boundary="b"',
      '',
      '--b',
      'Content-Type: text/html; charset="utf-8"',
      '',
      '<p>Hola <img src="cid:logo@x"></p>',
      '--b',
      'Content-Type: image/png',
      'Content-Transfer-Encoding: base64',
      'Content-ID: <logo@x>',
      'Content-Disposition: inline; filename="logo.png"',
      '',
      'iVBORw0KGgo=',
      '--b--',
      '',
    ].join('\r\n');
    const r = await leerEml(escribir('inline.eml', eml));
    expect(r.adjuntos).toEqual([]);
  });

  it('un archivo sin cabeceras de correo → 400 CORREO_ILEGIBLE', async () => {
    const ruta = escribir('corrupto.eml', 'esto no es un correo\nsolo texto suelto');
    await expect(leerEml(ruta)).rejects.toMatchObject({ codigo: 'CORREO_ILEGIBLE' });
  });
});

describe('leerMsg', () => {
  // No hay forma de generar un .msg sin Outlook ni fixture de prueba (spec fase-2 §4.5 y pregunta 1):
  // se verifica a mano con un .msg real. Mientras tanto solo se prueba el rechazo de basura.
  it.skip('lee un .msg real (requiere apps/api/test/fixtures/correo.msg)', async () => {
    const r = await leerMsg(escribir('correo.msg', archivoDePrueba('correo.msg')));
    expect(r.origen).toBe('msg');
    expect(r.asunto).toBeTruthy();
  });

  it('un archivo que no es CFB → 400 CORREO_ILEGIBLE', async () => {
    const ruta = escribir('basura.msg', Buffer.from('no soy un mensaje de Outlook'));
    await expect(leerMsg(ruta)).rejects.toMatchObject({ codigo: 'CORREO_ILEGIBLE' });
  });
});
