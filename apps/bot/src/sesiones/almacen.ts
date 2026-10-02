import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';
import { errorSeguro } from '../config/logger.js';

export type SesionBot = { token: string; usuario_id: number; nombre: string };

const LARGO_IV = 12;
const LARGO_TAG = 16;
const NOMBRE_ARCHIVO = 'sesiones.json.enc';

/**
 * chat_id → sesión del bot (ADR 0008). Archivo `sesiones.json.enc`: IV (12 bytes, nuevo en cada
 * escritura) + texto cifrado AES-256-GCM + tag (16 bytes). Escritura atómica y permisos 0600.
 * Es síncrono a propósito: el volumen es mínimo y evita carreras entre escrituras.
 */
export class AlmacenSesiones {
  private readonly archivo: string;
  private readonly sesiones = new Map<string, SesionBot>();

  constructor(private readonly opciones: { dir: string; clave: Buffer; logger: Logger }) {
    if (opciones.clave.length !== 32) throw new Error('La clave de cifrado debe tener 32 bytes');
    this.archivo = path.join(opciones.dir, NOMBRE_ARCHIVO);
    this.cargar();
  }

  obtener(chatId: number): SesionBot | undefined {
    return this.sesiones.get(String(chatId));
  }

  guardar(chatId: number, sesion: SesionBot): void {
    this.sesiones.set(String(chatId), sesion);
    this.persistir();
  }

  borrar(chatId: number): void {
    if (this.sesiones.delete(String(chatId))) this.persistir();
  }

  private cargar(): void {
    let contenido: Buffer;
    try {
      contenido = readFileSync(this.archivo);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.opciones.logger.error(
          { err: errorSeguro(err) },
          'no pude leer el archivo de sesiones',
        );
      }
      return;
    }
    try {
      if (contenido.length < LARGO_IV + LARGO_TAG) throw new Error('archivo truncado');
      const iv = contenido.subarray(0, LARGO_IV);
      const tag = contenido.subarray(contenido.length - LARGO_TAG);
      const cifrado = contenido.subarray(LARGO_IV, contenido.length - LARGO_TAG);
      const d = createDecipheriv('aes-256-gcm', this.opciones.clave, iv);
      d.setAuthTag(tag);
      const plano = Buffer.concat([d.update(cifrado), d.final()]).toString('utf8');
      const datos = JSON.parse(plano) as Record<string, SesionBot>;
      for (const [k, v] of Object.entries(datos)) this.sesiones.set(k, v);
    } catch {
      this.sesiones.clear();
      this.opciones.logger.error(
        'no pude descifrar el archivo de sesiones (¿cambió BOT_CLAVE_CIFRADO?); arranco vacío',
      );
    }
  }

  private persistir(): void {
    const plano = JSON.stringify(Object.fromEntries(this.sesiones));
    const iv = randomBytes(LARGO_IV);
    const c = createCipheriv('aes-256-gcm', this.opciones.clave, iv);
    const cifrado = Buffer.concat([c.update(plano, 'utf8'), c.final()]);
    const salida = Buffer.concat([iv, cifrado, c.getAuthTag()]);
    mkdirSync(this.opciones.dir, { recursive: true });
    const tmp = `${this.archivo}.tmp`;
    writeFileSync(tmp, salida, { mode: 0o600 });
    renameSync(tmp, this.archivo);
    try {
      chmodSync(this.archivo, 0o600);
    } catch {
      // Windows: los permisos POSIX no aplican
    }
  }
}
