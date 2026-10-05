import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request, type BrowserContext, type Page } from '@playwright/test';

export type UsuarioSemilla = 'crojas' | 'sdiaz' | 'hikki';

// La contraseña de las semillas se lee en tiempo de ejecución: del entorno o del `.env` de la raíz.
// Nunca se escribe en informes, trazas ni consola.
function contrasenaSemilla(): string {
  if (process.env.SEMILLA_PASSWORD) return process.env.SEMILLA_PASSWORD;
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const texto = fs.readFileSync(path.join(raiz, '.env'), 'utf8');
  // Como dotenv, gana la última línea: el `.env` del CI copia `.env.example` (con la clave vacía) y
  // agrega el valor al final.
  const lineas = [...texto.matchAll(/^SEMILLA_PASSWORD=(.*)$/gm)];
  const valor = lineas
    .at(-1)?.[1]
    ?.trim()
    .replace(/^(['"])(.*)\1$/, '$2');
  if (!valor) throw new Error('Falta SEMILLA_PASSWORD (entorno o .env de la raíz)');
  return valor;
}

export const USUARIOS_SEMILLA: UsuarioSemilla[] = ['crojas', 'sdiaz', 'hikki'];

const carpetaSesiones = path.join(os.tmpdir(), 'zydesk-e2e');
const archivoSesion = (usuario: UsuarioSemilla) => path.join(carpetaSesiones, `${usuario}.json`);

// La API limita a 20 ingresos por IP cada 15 min (ADR 0013): se ingresa una sola vez por persona y por
// ejecución (globalSetup) y cada test reutiliza la cookie. Las cookies quedan en una carpeta temporal solo
// para el usuario (0700) que globalTeardown borra al terminar.
export async function iniciarSesiones(baseURL: string): Promise<void> {
  const contrasena = contrasenaSemilla();
  fs.mkdirSync(carpetaSesiones, { recursive: true, mode: 0o700 });
  for (const usuario of USUARIOS_SEMILLA) {
    const contexto = await request.newContext({ baseURL });
    const respuesta = await contexto.post('/api/auth/ingresar', {
      headers: { 'X-Requested-With': 'Zydesk' },
      data: { correo: `${usuario}@zydesk.local`, contrasena },
    });
    if (respuesta.status() !== 200) {
      throw new Error(`Ingreso de ${usuario} rechazado (${respuesta.status()})`);
    }
    await contexto.storageState({ path: archivoSesion(usuario) });
    await contexto.dispose();
  }
}

export function borrarSesiones(): void {
  fs.rmSync(carpetaSesiones, { recursive: true, force: true });
}

export async function ingresar(page: Page, usuario: UsuarioSemilla): Promise<void> {
  const { cookies } = JSON.parse(fs.readFileSync(archivoSesion(usuario), 'utf8')) as {
    cookies: Parameters<BrowserContext['addCookies']>[0];
  };
  await page.context().clearCookies();
  await page.context().addCookies(cookies);
}

// Los ids de las semillas no son estables: se buscan por código.
async function idPorCodigo(page: Page, ruta: 'tickets' | 'ots', codigo: string): Promise<number> {
  const r = await page.request.get(`/api/${ruta}?q=${codigo.replace(/\D/g, '')}`);
  const { datos } = (await r.json()) as { datos: { id: number; codigo: string }[] };
  const e = datos.find((x) => x.codigo === codigo);
  if (!e) throw new Error(`No existe ${codigo} en las semillas`);
  return e.id;
}

export const idDeTicket = (page: Page, codigo: string) => idPorCodigo(page, 'tickets', codigo);
export const idDeOt = (page: Page, codigo: string) => idPorCodigo(page, 'ots', codigo);
