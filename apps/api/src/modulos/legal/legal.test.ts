import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../app.js';
import { cargarLegal, parsearDocumento, versionTerminosVigente } from './legal.service.js';

const app = () => crearApp({ comprobarBd: async () => true });

describe('GET /api/legal/:clave', () => {
  it('sirve términos y privacidad sin sesión, con front matter parseado', async () => {
    const a = app();
    const t = await request(a).get('/api/legal/terminos');
    expect(t.status).toBe(200);
    expect(t.body).toMatchObject({
      clave: 'terminos',
      titulo: 'Términos de uso',
      borrador: true,
    });
    expect(t.body.version).toBe(versionTerminosVigente());
    expect(t.body.contenido_md).toContain('BORRADOR');
    expect(t.body.contenido_md).not.toContain('version:');
    const p = await request(a).get('/api/legal/privacidad');
    expect(p.status).toBe(200);
    expect(p.body.clave).toBe('privacidad');
    expect((await request(a).get('/api/legal/otro')).status).toBe(400);
  });
});

describe('carga de documentos legales', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = '';
    cargarLegal(); // restaura los documentos reales para los demás tests
  });

  const preparar = (terminos: string | null, privacidad: string | null): URL => {
    dir = mkdtempSync(join(tmpdir(), 'zydesk-legal-'));
    if (terminos !== null) writeFileSync(join(dir, 'terminos-de-uso.md'), terminos);
    if (privacidad !== null) writeFileSync(join(dir, 'politica-de-privacidad.md'), privacidad);
    return pathToFileURL(`${dir}/`);
  };
  const doc = (version: string) =>
    `---\nversion: ${version}\ntitulo: T\nborrador: false\n---\nHola\n`;

  it('lee versión, título y borrador', () => {
    const d = parsearDocumento(
      'terminos',
      '---\r\nversion: v1\r\ntitulo: Mi título: largo\r\nborrador: true\r\n---\r\nTexto',
    );
    expect(d).toEqual({
      clave: 'terminos',
      version: 'v1',
      titulo: 'Mi título: largo',
      contenido_md: 'Texto',
      borrador: true,
    });
  });

  it('falla si falta un archivo, el front matter o la versión', () => {
    expect(() => cargarLegal(preparar(doc('v1'), null))).toThrow();
    expect(() => cargarLegal(preparar(doc(''), doc('v1')))).toThrow(/version/);
    expect(() => cargarLegal(preparar('sin front matter', doc('v1')))).toThrow(/front matter/);
  });

  it('la versión vigente sale de terminos-de-uso.md', () => {
    cargarLegal(preparar(doc('2030-01-01'), doc('otra')));
    expect(versionTerminosVigente()).toBe('2030-01-01');
  });
});
