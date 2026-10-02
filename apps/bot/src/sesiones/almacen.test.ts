import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { crearLogger } from '../config/logger.js';
import { AlmacenSesiones } from './almacen.js';

function entorno() {
  const dir = mkdtempSync(path.join(tmpdir(), 'zydesk-almacen-'));
  const lineas: string[] = [];
  const logger = crearLogger({
    nivel: 'debug',
    entorno: 'test',
    version: '0',
    destino: new Writable({
      write(chunk, _e, cb) {
        lineas.push(String(chunk));
        cb();
      },
    }),
  });
  return { dir, logger, lineas, archivo: path.join(dir, 'sesiones.json.enc') };
}

const sesion = { token: 'TOKEN-EN-CLARO-XYZ', usuario_id: 5, nombre: 'Sebastián' };

describe('AlmacenSesiones', () => {
  it('arranca vacío si no existe el archivo', () => {
    const { dir, logger } = entorno();
    const a = new AlmacenSesiones({ dir, clave: randomBytes(32), logger });
    expect(a.obtener(1)).toBeUndefined();
  });

  it('escribe cifrado: el archivo no contiene el token en claro', () => {
    const { dir, logger, archivo } = entorno();
    const a = new AlmacenSesiones({ dir, clave: randomBytes(32), logger });
    a.guardar(1, sesion);
    const bytes = readFileSync(archivo);
    expect(bytes.includes(Buffer.from(sesion.token))).toBe(false);
    expect(bytes.toString('utf8')).not.toContain('Sebastián');
  });

  it('relee tras reiniciar y borra', () => {
    const { dir, logger } = entorno();
    const clave = randomBytes(32);
    new AlmacenSesiones({ dir, clave, logger }).guardar(1, sesion);
    const b = new AlmacenSesiones({ dir, clave, logger });
    expect(b.obtener(1)).toEqual(sesion);
    b.borrar(1);
    expect(new AlmacenSesiones({ dir, clave, logger }).obtener(1)).toBeUndefined();
  });

  it('usa un IV distinto en cada escritura', () => {
    const { dir, logger, archivo } = entorno();
    const a = new AlmacenSesiones({ dir, clave: randomBytes(32), logger });
    a.guardar(1, sesion);
    const iv1 = readFileSync(archivo).subarray(0, 12);
    a.guardar(1, sesion);
    const iv2 = readFileSync(archivo).subarray(0, 12);
    expect(iv1.equals(iv2)).toBe(false);
  });

  it('con otra clave arranca vacío sin lanzar y registra un error', () => {
    const { dir, logger, lineas } = entorno();
    new AlmacenSesiones({ dir, clave: randomBytes(32), logger }).guardar(1, sesion);
    const otra = new AlmacenSesiones({ dir, clave: randomBytes(32), logger });
    expect(otra.obtener(1)).toBeUndefined();
    expect(lineas.join('')).toContain('"level":"error"');
  });

  it('un archivo manipulado (tag inválido) arranca vacío', () => {
    const { dir, logger, archivo } = entorno();
    const clave = randomBytes(32);
    new AlmacenSesiones({ dir, clave, logger }).guardar(1, sesion);
    const bytes = readFileSync(archivo);
    bytes[20] = (bytes[20] ?? 0) ^ 0xff;
    writeFileSync(archivo, bytes);
    expect(new AlmacenSesiones({ dir, clave, logger }).obtener(1)).toBeUndefined();
  });

  it('rechaza una clave que no es de 32 bytes', () => {
    const { dir, logger } = entorno();
    expect(() => new AlmacenSesiones({ dir, clave: randomBytes(16), logger })).toThrow();
  });
});
