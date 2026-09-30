import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { crearStorage } from './storage.js';

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'zydesk-storage-test-'));
afterAll(() => fs.rmSync(raiz, { recursive: true, force: true }));

const CLAVE = /^\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.txt$/;

describe('StorageLocal', () => {
  it('guarda un Buffer con clave aaaa/mm/<uuid>.<ext>, lo abre y lo elimina (ENOENT ignorado)', async () => {
    const s = crearStorage(path.join(raiz, 'a'));
    const clave = await s.guardar(Buffer.from('hola'), '.txt');
    expect(clave).toMatch(CLAVE);
    expect(await s.existe(clave)).toBe(true);
    expect(fs.readFileSync(s.ruta(clave), 'utf8')).toBe('hola');
    const partes: Buffer[] = [];
    for await (const parte of s.abrir(clave)) partes.push(parte as Buffer);
    expect(Buffer.concat(partes).toString()).toBe('hola');
    await s.eliminar(clave);
    expect(await s.existe(clave)).toBe(false);
    await expect(s.eliminar(clave)).resolves.toBeUndefined();
  });

  it('mueve (rename) un archivo temporal', async () => {
    const s = crearStorage(path.join(raiz, 'b'));
    const temporal = path.join(raiz, 'temporal.bin');
    fs.writeFileSync(temporal, 'contenido');
    const clave = await s.guardar(temporal, '.txt');
    expect(fs.existsSync(temporal)).toBe(false);
    expect(fs.readFileSync(s.ruta(clave), 'utf8')).toBe('contenido');
  });

  it('nunca resuelve una clave fuera del directorio', () => {
    const s = crearStorage(path.join(raiz, 'c'));
    expect(() => s.ruta('../fuera.txt')).toThrow();
    expect(() => s.ruta('2026/09/../../../fuera.txt')).toThrow();
  });
});
