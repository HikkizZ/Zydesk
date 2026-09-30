import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ingresarComo } from '../../test/fabricas.js';
import { crearApp } from '../app.js';
import { dataSource } from '../config/db.js';
import { crearAdmin, ErrorCli } from './admin.js';

const raizApi = fileURLToPath(new URL('../../', import.meta.url));
const tsx = fileURLToPath(new URL('../../../../node_modules/tsx/dist/cli.mjs', import.meta.url));

function ejecutarCli(contrasena: string, extra: string[] = []) {
  return spawnSync(
    process.execPath,
    [
      tsx,
      'src/database/cli.ts',
      'admin',
      '--correo',
      'admin@x.cl',
      '--nombre',
      'Administración',
      ...extra,
    ],
    {
      cwd: raizApi,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test', TZ: 'UTC', ADMIN_PASSWORD: contrasena },
    },
  );
}

describe('crearAdmin', () => {
  it('crea un admin que puede ingresar, audita y no guarda la clave en claro', async () => {
    const id = await crearAdmin({
      correo: 'Admin@X.cl',
      nombre: ' Administración ',
      contrasena: 'Clave.Admin.123',
    });
    const [u] = await dataSource.query(`SELECT * FROM usuario WHERE id = $1`, [id]);
    expect(u).toMatchObject({
      correo: 'admin@x.cl',
      nombre: 'Administración',
      rol: 'admin',
      activo: true,
    });
    expect(u.contrasena_hash).toMatch(/^\$argon2id\$/);
    const [ev] = await dataSource.query(`SELECT usuario_id, detalle FROM auditoria`);
    expect(ev.usuario_id).toBeNull();
    expect(JSON.stringify(ev)).not.toContain('Clave.Admin.123');
    // los términos quedan pendientes: ingresa y puede aceptarlos
    const { agente } = await ingresarComo(
      crearApp({ comprobarBd: async () => true }),
      { correo: 'admin@x.cl' },
      'Clave.Admin.123',
    );
    expect((await agente.get('/api/yo')).body.rol).toBe('admin');
  });

  it('rechaza contraseña ausente o que no cumple la política, y usuarios repetidos', async () => {
    const base = { correo: 'admin@x.cl', nombre: 'A' };
    await expect(crearAdmin({ ...base, contrasena: undefined })).rejects.toThrow(
      'ADMIN_PASSWORD no definida o inválida',
    );
    await expect(crearAdmin({ ...base, contrasena: 'corta' })).rejects.toThrow(ErrorCli);
    await expect(crearAdmin({ ...base, contrasena: 'password123' })).rejects.toThrow(
      'ADMIN_PASSWORD no definida o inválida',
    );
    await expect(crearAdmin({ ...base, contrasena: 'admin@x.cl' })).rejects.toThrow(
      'ADMIN_PASSWORD no definida o inválida',
    );
    await crearAdmin({ ...base, contrasena: 'Clave.Admin.123' });
    await expect(crearAdmin({ ...base, contrasena: 'Clave.Admin.123' })).rejects.toThrow(
      'El usuario ya existe',
    );
  });
});

describe('npm run db:admin (cli.ts admin)', () => {
  it('sin ADMIN_PASSWORD termina con código 1', () => {
    const r = ejecutarCli('');
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('ADMIN_PASSWORD no definida o inválida');
  });

  it('con ADMIN_PASSWORD válida crea el admin (código 0) y no imprime la clave; repetir → 1', async () => {
    const ok = ejecutarCli('Clave.Admin.123');
    expect(ok.status).toBe(0);
    expect(ok.stdout + ok.stderr).not.toContain('Clave.Admin.123');
    const [{ n }] = await dataSource.query(
      `SELECT count(*)::int AS n FROM usuario WHERE rol = 'admin'`,
    );
    expect(n).toBe(1);
    const otra = ejecutarCli('Clave.Admin.123');
    expect(otra.status).toBe(1);
    expect(otra.stdout + otra.stderr).toContain('El usuario ya existe');
  });
});
