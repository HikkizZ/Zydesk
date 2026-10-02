import type PgBoss from 'pg-boss';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  crearAviso,
  crearMensaje,
  crearTicket,
  crearUsuario,
  crearVinculoTelegram,
  fijarPreferencia,
} from '../../../test/fabricas.js';
import { fijarEnv } from '../../../test/entorno.js';
import { dataSource } from '../../config/db.js';
import { hoyEnSantiago } from '../../modulos/horas/horas.tipos.js';
import {
  ejecutarResumenDiario,
  registrarJobResumenDiario,
  construirResumen,
} from './resumen-diario.js';

let fetchDoble: MockInstance<typeof fetch>;
beforeEach(() => {
  fijarEnv('TELEGRAM_BOT_TOKEN', 'token-de-prueba');
  fijarEnv('WEB_URL', 'https://desk.example.test');
  fetchDoble = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response('{"ok":true}', { status: 200 }));
});
afterEach(() => fetchDoble.mockRestore());

interface Enviado {
  chat_id: number;
  text: string;
}
const enviados = (): Enviado[] =>
  fetchDoble.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)) as Enviado);

describe('ejecutarResumenDiario', () => {
  it('envía un mensaje con el código del ticket que vence hoy y sin el texto de sus mensajes', async () => {
    const u = await crearUsuario();
    const { chat_id } = await crearVinculoTelegram(u.id, { chat_id: 4321 });
    const t = await crearTicket({
      principal_id: u.id,
      asunto: 'Servidor de archivos caído',
      fecha_limite: new Date(),
    });
    await crearMensaje(t.id, { autor_id: u.id, texto: 'MENSAJE-PRIVADO-XYZ' });
    const r = await ejecutarResumenDiario('job-1');
    expect(r).toEqual({ enviados: 1, omitidos: 0, fallidos: 0, feriado: false });
    const [m] = enviados();
    expect(m!.chat_id).toBe(chat_id);
    expect(m!.text).toContain('<b>Zydesk · Resumen del ');
    expect(m!.text).toContain(`Vencen hoy (1): ${t.codigo} Servidor de archivos caído`);
    expect(m!.text).toContain('<a href="https://desk.example.test/mi-dia">Abrir Mi día</a>');
    expect(m!.text).not.toContain('MENSAJE-PRIVADO-XYZ');
  });

  it('no envía a quien no tiene vínculo, tiene el resumen apagado, está inactivo o no tiene nada pendiente', async () => {
    const sinVinculo = await crearUsuario();
    const apagado = await crearUsuario();
    const inactivo = await crearUsuario({ activo: false });
    const vacio = await crearUsuario();
    for (const u of [apagado, inactivo, vacio]) await crearVinculoTelegram(u.id);
    await fijarPreferencia(apagado.id, 'resumen_diario', 'telegram', false);
    for (const u of [sinVinculo, apagado, inactivo]) {
      await crearTicket({ principal_id: u.id, fecha_limite: new Date() });
    }
    const r = await ejecutarResumenDiario();
    expect(r).toMatchObject({ enviados: 0, omitidos: 1, fallidos: 0 });
    expect(fetchDoble).not.toHaveBeenCalled();
  });

  it('en un feriado general no envía a nadie', async () => {
    const u = await crearUsuario();
    await crearVinculoTelegram(u.id);
    await crearTicket({ principal_id: u.id, fecha_limite: new Date() });
    await dataSource.query(`INSERT INTO feriado (fecha, nombre) VALUES ($1, 'Feriado de prueba')`, [
      hoyEnSantiago(),
    ]);
    const r = await ejecutarResumenDiario();
    expect(r).toMatchObject({ feriado: true, enviados: 0 });
    expect(fetchDoble).not.toHaveBeenCalled();
  });

  it('sin token no envía nada', async () => {
    fijarEnv('TELEGRAM_BOT_TOKEN', undefined);
    const u = await crearUsuario();
    await crearVinculoTelegram(u.id);
    await crearTicket({ principal_id: u.id, fecha_limite: new Date() });
    expect(await ejecutarResumenDiario()).toMatchObject({ enviados: 0 });
    expect(fetchDoble).not.toHaveBeenCalled();
  });

  it('un fallo de Telegram con una persona no impide el envío a las demás', async () => {
    const a = await crearUsuario();
    const b = await crearUsuario();
    await crearVinculoTelegram(a.id, { chat_id: 1 });
    await crearVinculoTelegram(b.id, { chat_id: 2 });
    await crearTicket({ principal_id: a.id, fecha_limite: new Date() });
    await crearTicket({ principal_id: b.id, fecha_limite: new Date() });
    fetchDoble.mockResolvedValueOnce(new Response('{"ok":false}', { status: 403 }));
    const r = await ejecutarResumenDiario();
    expect(r).toMatchObject({ enviados: 1, fallidos: 1 });
  });

  it('menciones sin leer cuentan como algo que mostrar', async () => {
    const u = await crearUsuario();
    await crearVinculoTelegram(u.id);
    await crearAviso(u.id);
    await ejecutarResumenDiario();
    expect(enviados()[0]!.text).toContain('Menciones sin leer: 1');
  });
});

describe('construirResumen', () => {
  const base = {
    fecha: '2026-10-01',
    vencen_hoy: [],
    vencidos: [],
    por_aprobar: [],
    menciones: [],
    tareas: [],
    detenidos: [],
    conteos: { vencen_hoy: 0, vencidos: 0, por_aprobar: 0, menciones: 0, tareas: 0, detenidos: 0 },
  };

  it('sin nada que mostrar devuelve null', () => {
    expect(construirResumen(base)).toBeNull();
  });

  it('lista hasta 5 ítems con "y N más", recorta el asunto a 60 y escapa HTML', () => {
    const tickets = Array.from({ length: 5 }, (_, i) => ({
      codigo: `TK-${i}`,
      asunto: i === 0 ? '<b>x</b>'.padEnd(80, 'y') : `Asunto ${i}`,
    }));
    const texto = construirResumen({
      ...base,
      vencen_hoy: tickets,
      conteos: { ...base.conteos, vencen_hoy: 7 },
    } as never)!;
    expect(texto).toContain('Vencen hoy (7): ');
    expect(texto).toContain('y 2 más');
    expect(texto).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(texto).not.toContain('<b>x</b>');
    expect(texto.split('\n')[0]).toBe('<b>Zydesk · Resumen del jueves 1 de octubre</b>');
  });
});

describe('registrarJobResumenDiario', () => {
  it('programa 08:30 de lunes a viernes en America/Santiago', async () => {
    const schedule = vi.fn();
    const boss = {
      createQueue: vi.fn(),
      work: vi.fn(),
      schedule,
    } as unknown as PgBoss;
    await registrarJobResumenDiario(boss);
    expect(schedule).toHaveBeenCalledWith(
      'avisos.resumen_diario',
      '30 8 * * 1-5',
      {},
      {
        tz: 'America/Santiago',
      },
    );
  });
});
