// Fija la misma versión en la raíz y los cuatro workspaces (y en package-lock.json),
// sin tocar el resto del lock. Uso: npm run version:fijar -- 1.0.0  (ADR 0032).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION_VALIDA = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-rc\.(0|[1-9]\d*))?$/;

function leerJson(ruta) {
  const texto = readFileSync(ruta, 'utf-8');
  return { datos: JSON.parse(texto), eol: texto.includes('\r\n') ? '\r\n' : '\n' };
}

function escribirJson(ruta, datos, eol) {
  writeFileSync(ruta, JSON.stringify(datos, null, 2).replace(/\n/g, eol) + eol);
}

// Devuelve una copia con `version` justo después de `name` (como la deja npm).
function conVersion(objeto, version) {
  const copia = {};
  for (const [clave, valor] of Object.entries(objeto)) {
    if (clave === 'version') continue;
    copia[clave] = valor;
    if (clave === 'name') copia.version = version;
  }
  if (!('version' in copia)) copia.version = version;
  return copia;
}

function rutasWorkspaces(raiz) {
  return leerJson(join(raiz, 'package.json')).datos.workspaces;
}

export function leerVersiones(raiz) {
  const versiones = { '.': leerJson(join(raiz, 'package.json')).datos.version };
  for (const ws of rutasWorkspaces(raiz)) {
    versiones[ws] = leerJson(join(raiz, ws, 'package.json')).datos.version;
  }
  return versiones;
}

export function fijarVersion(raiz, version) {
  if (typeof version !== 'string' || !VERSION_VALIDA.test(version)) {
    throw new Error(`versión inválida: "${version ?? ''}" (se espera X.Y.Z o X.Y.Z-rc.N, sin "v")`);
  }
  const workspaces = rutasWorkspaces(raiz);
  const lock = leerJson(join(raiz, 'package-lock.json'));
  for (const ruta of ['', ...workspaces]) {
    if (!lock.datos.packages?.[ruta]) {
      throw new Error(`package-lock.json no tiene la entrada "${ruta}"`);
    }
  }

  lock.datos = conVersion(lock.datos, version);
  for (const ruta of ['', ...workspaces]) {
    lock.datos.packages[ruta] = conVersion(lock.datos.packages[ruta], version);
  }
  for (const ruta of ['.', ...workspaces]) {
    const archivo = join(raiz, ruta, 'package.json');
    const { datos, eol } = leerJson(archivo);
    escribirJson(archivo, conVersion(datos, version), eol);
  }
  escribirJson(join(raiz, 'package-lock.json'), lock.datos, lock.eol);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const raiz = fileURLToPath(new URL('..', import.meta.url));
    fijarVersion(raiz, process.argv[2]);
    console.log(`Versión fijada en ${process.argv[2]} (raíz, 4 workspaces y package-lock.json).`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
