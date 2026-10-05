import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fijarVersion, leerVersiones } from './version-fijar.mjs';

const RAIZ_REPO = fileURLToPath(new URL('..', import.meta.url));
const WORKSPACES = ['packages/shared', 'apps/api', 'apps/web', 'apps/bot'];

function crearRepo({ versionRaiz } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'zydesk-version-'));
  const raiz = { name: 'zydesk', private: true, workspaces: WORKSPACES };
  if (versionRaiz) raiz.version = versionRaiz;
  writeFileSync(join(dir, 'package.json'), JSON.stringify(raiz, null, 2) + '\n');
  const lock = {
    name: 'zydesk',
    lockfileVersion: 3,
    requires: true,
    packages: { '': { name: 'zydesk', workspaces: WORKSPACES } },
  };
  for (const ws of WORKSPACES) {
    mkdirSync(join(dir, ws), { recursive: true });
    const nombre = `@zydesk/${ws.split('/')[1]}`;
    writeFileSync(
      join(dir, ws, 'package.json'),
      JSON.stringify({ name: nombre, version: '0.1.0', private: true }, null, 2) + '\n',
    );
    lock.packages[ws] = { name: nombre, version: '0.1.0', dependencies: { x: '^1.0.0' } };
  }
  lock.packages['node_modules/otro'] = { version: '9.9.9' };
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  return dir;
}

const leer = (dir, ruta) => JSON.parse(readFileSync(join(dir, ruta), 'utf-8'));

test('rechaza versiones inválidas sin tocar nada', () => {
  const dir = crearRepo();
  try {
    for (const mala of [
      '',
      'v1.0.0',
      '1.0',
      '1.0.0.0',
      '01.0.0',
      '1.0.0-beta.1',
      '1.0.0-rc',
      'x',
    ]) {
      assert.throws(() => fijarVersion(dir, mala), /versión inválida/, `debía rechazar "${mala}"`);
    }
    assert.throws(() => fijarVersion(dir, undefined), /versión inválida/);
    assert.deepEqual(Object.values(leerVersiones(dir)), [
      undefined,
      ...WORKSPACES.map(() => '0.1.0'),
    ]);
    assert.equal(leer(dir, 'package-lock.json').packages['apps/api'].version, '0.1.0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('actualiza los 5 package.json y el lock de forma coherente', () => {
  const dir = crearRepo();
  try {
    fijarVersion(dir, '1.0.0');
    assert.equal(leer(dir, 'package.json').version, '1.0.0');
    for (const ws of WORKSPACES) assert.equal(leer(dir, `${ws}/package.json`).version, '1.0.0');
    const lock = leer(dir, 'package-lock.json');
    assert.equal(lock.version, '1.0.0');
    assert.equal(lock.packages[''].version, '1.0.0');
    for (const ws of WORKSPACES) assert.equal(lock.packages[ws].version, '1.0.0');
    assert.equal(lock.packages['node_modules/otro'].version, '9.9.9');
    assert.deepEqual(lock.packages['apps/api'].dependencies, { x: '^1.0.0' });
    assert.deepEqual(Object.keys(lock).slice(0, 3), ['name', 'version', 'lockfileVersion']);
    assert.deepEqual(Object.keys(lock.packages['']).slice(0, 2), ['name', 'version']);
    assert.deepEqual(Object.keys(leer(dir, 'package.json')).slice(0, 2), ['name', 'version']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('acepta prelanzamientos rc y es idempotente', () => {
  const dir = crearRepo({ versionRaiz: '0.1.0' });
  try {
    fijarVersion(dir, '1.0.0-rc.1');
    const antes = readFileSync(join(dir, 'package-lock.json'), 'utf-8');
    fijarVersion(dir, '1.0.0-rc.1');
    assert.equal(readFileSync(join(dir, 'package-lock.json'), 'utf-8'), antes);
    assert.equal(leer(dir, 'apps/bot/package.json').version, '1.0.0-rc.1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('conserva el fin de línea CRLF', () => {
  const dir = crearRepo();
  try {
    const ruta = join(dir, 'apps/api/package.json');
    writeFileSync(ruta, readFileSync(ruta, 'utf-8').replace(/\n/g, '\r\n'));
    fijarVersion(dir, '1.2.3');
    const txt = readFileSync(ruta, 'utf-8');
    assert.ok(txt.includes('\r\n') && !/[^\r]\n/.test(txt));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('falla sin tocar nada si el lock no tiene la entrada de un workspace', () => {
  const dir = crearRepo();
  try {
    const lock = leer(dir, 'package-lock.json');
    delete lock.packages['apps/web'];
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
    assert.throws(() => fijarVersion(dir, '1.0.0'), /apps\/web/);
    assert.equal(leer(dir, 'apps/api/package.json').version, '0.1.0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el repositorio real tiene los 5 package.json y el lock en la misma versión', () => {
  const versiones = leerVersiones(RAIZ_REPO);
  const unicas = new Set(Object.values(versiones));
  assert.equal(unicas.size, 1, JSON.stringify(versiones));
  const [version] = unicas;
  assert.match(version, /^\d+\.\d+\.\d+(-rc\.\d+)?$/);
  const lock = leer(RAIZ_REPO, 'package-lock.json');
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  for (const ws of WORKSPACES) assert.equal(lock.packages[ws].version, version);
});
