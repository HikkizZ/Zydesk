import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { env } from '../../config/env.js';

// ADR 0009: almacenamiento de archivos detrás de una interfaz; una sola implementación en disco.
export interface Storage {
  // `origen` = ruta temporal (se mueve) o contenido; devuelve la clave `aaaa/mm/<uuid><ext>`
  guardar(origen: string | Buffer, ext: string): Promise<string>;
  abrir(clave: string): Readable;
  ruta(clave: string): string;
  eliminar(clave: string): Promise<void>;
  existe(clave: string): Promise<boolean>;
}

export function crearStorage(dir: string): Storage {
  const base = path.resolve(dir);

  // La clave la genera el servidor; aun así nunca se resuelve fuera de `base`.
  const ruta = (clave: string): string => {
    const completa = path.resolve(base, clave);
    if (!completa.startsWith(base + path.sep)) throw new Error('Clave de archivo inválida');
    return completa;
  };

  return {
    async guardar(origen, ext) {
      const ahora = new Date();
      const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0');
      const clave = `${ahora.getUTCFullYear()}/${mes}/${randomUUID()}${ext}`;
      const destino = ruta(clave);
      await fs.promises.mkdir(path.dirname(destino), { recursive: true });
      if (typeof origen === 'string') {
        try {
          await fs.promises.rename(origen, destino);
        } catch (err) {
          // el temporal puede estar en otra unidad (EXDEV)
          if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
          await fs.promises.copyFile(origen, destino);
          await fs.promises.unlink(origen);
        }
      } else {
        await fs.promises.writeFile(destino, origen);
      }
      return clave;
    },
    abrir: (clave) => fs.createReadStream(ruta(clave)),
    ruta,
    async eliminar(clave) {
      try {
        await fs.promises.unlink(ruta(clave));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },
    async existe(clave) {
      try {
        await fs.promises.access(ruta(clave));
        return true;
      } catch {
        return false;
      }
    },
  };
}

// En tests: TEST_ARCHIVOS_DIR o un directorio temporal por proceso (spec fase-2 §3.2).
export const directorioArchivos: string =
  env.NODE_ENV === 'test'
    ? path.resolve(
        env.TEST_ARCHIVOS_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'zydesk-archivos-')),
      )
    : env.ARCHIVOS_DIR;

export const storage: Storage = crearStorage(directorioArchivos);
