import { describe, expect, it } from 'vitest';
import {
  crearAviso,
  crearCodigoVinculo,
  crearUsuario,
  crearVinculoTelegram,
  fijarPreferencia,
} from '../../test/fabricas.js';
import { dataSource } from '../config/db.js';
import { hashCodigo } from '../modulos/telegram/telegram.service.js';

async function codigoError(consulta: Promise<unknown>): Promise<string | undefined> {
  try {
    await consulta;
  } catch (err) {
    return (err as { driverError?: { code?: string } }).driverError?.code;
  }
  return undefined;
}

const CHECK = '23514';
const UNICO = '23505';

describe('fábricas de la Fase 6', () => {
  it('dos avisos con la misma clave para el mismo usuario violan aviso_clave_uq', async () => {
    const a = await crearUsuario();
    const b = await crearUsuario();
    await crearAviso(a.id, { clave: 'vence_pronto:ticket:1:x' });
    expect(await codigoError(crearAviso(a.id, { clave: 'vence_pronto:ticket:1:x' }))).toBe(UNICO);
    // otro usuario con la misma clave, y claves nulas repetidas, se aceptan
    await crearAviso(b.id, { clave: 'vence_pronto:ticket:1:x' });
    await crearAviso(a.id);
    await crearAviso(a.id);
  });

  it('crearAviso aplica valores por defecto y respeta leido y en_app', async () => {
    const u = await crearUsuario();
    const aviso = await crearAviso(u.id, { leido: true, en_app: false });
    expect(aviso.evento).toBe('mencion');
    expect(aviso.en_app).toBe(false);
    expect(aviso.leido_en).not.toBeNull();
    expect(aviso.entidad).toBe('ticket');
  });

  it('preferencia_aviso rechaza resumen_diario por la app y fijarPreferencia hace upsert', async () => {
    const u = await crearUsuario();
    expect(await codigoError(fijarPreferencia(u.id, 'resumen_diario', 'app', true))).toBe(CHECK);
    await fijarPreferencia(u.id, 'mencion', 'telegram', false);
    await fijarPreferencia(u.id, 'mencion', 'telegram', true);
    const filas: { activo: boolean }[] = await dataSource.query(
      `SELECT activo FROM preferencia_aviso WHERE usuario_id = $1`,
      [u.id],
    );
    expect(filas).toEqual([{ activo: true }]);
  });

  it('dos vínculos con el mismo chat_id violan UNIQUE', async () => {
    const a = await crearUsuario();
    const b = await crearUsuario();
    await crearVinculoTelegram(a.id, { chat_id: 777 });
    expect(await codigoError(crearVinculoTelegram(b.id, { chat_id: 777 }))).toBe(UNICO);
  });

  it('borrar la sesión bot deja sesion_id en NULL y conserva el vínculo', async () => {
    const u = await crearUsuario();
    const { token } = await crearVinculoTelegram(u.id);
    expect(token).not.toBeNull();
    const [antes]: { sesion_id: string | null; origen: string }[] = await dataSource.query(
      `SELECT v.sesion_id, s.origen FROM vinculo_telegram v JOIN sesion s ON s.id = v.sesion_id
       WHERE v.usuario_id = $1`,
      [u.id],
    );
    expect(antes?.origen).toBe('bot');
    await dataSource.query(`DELETE FROM sesion WHERE id = $1`, [antes!.sesion_id]);
    const filas: { sesion_id: string | null }[] = await dataSource.query(
      `SELECT sesion_id FROM vinculo_telegram WHERE usuario_id = $1`,
      [u.id],
    );
    expect(filas).toEqual([{ sesion_id: null }]);
  });

  it('crearVinculoTelegram sin sesión devuelve token null', async () => {
    const u = await crearUsuario();
    const r = await crearVinculoTelegram(u.id, { con_sesion: false });
    expect(r.token).toBeNull();
  });

  it('crearCodigoVinculo guarda el hash y codigo_hash es único', async () => {
    const u = await crearUsuario();
    const codigo = await crearCodigoVinculo(u.id);
    expect(codigo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const filas: { usado_en: Date | null }[] = await dataSource.query(
      `SELECT usado_en FROM codigo_vinculo WHERE codigo_hash = $1`,
      [hashCodigo(codigo)],
    );
    expect(filas).toHaveLength(1);
    expect(
      await codigoError(
        dataSource.query(
          `INSERT INTO codigo_vinculo (codigo_hash, usuario_id, expira_en) VALUES ($1, $2, now())`,
          [hashCodigo(codigo), u.id],
        ),
      ),
    ).toBe(UNICO);
  });

  it('crearCodigoVinculo respeta expirado y usado', async () => {
    const u = await crearUsuario();
    const caducado = await crearCodigoVinculo(u.id, { expirado: true });
    const usado = await crearCodigoVinculo(u.id, { usado: true });
    const [a]: { vencido: boolean }[] = await dataSource.query(
      `SELECT expira_en < now() AS vencido FROM codigo_vinculo WHERE codigo_hash = $1`,
      [hashCodigo(caducado)],
    );
    const [b]: { usado: boolean }[] = await dataSource.query(
      `SELECT usado_en IS NOT NULL AS usado FROM codigo_vinculo WHERE codigo_hash = $1`,
      [hashCodigo(usado)],
    );
    expect(a?.vencido).toBe(true);
    expect(b?.usado).toBe(true);
  });
});
