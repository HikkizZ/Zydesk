import type PgBoss from 'pg-boss';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  crearCliente,
  crearCotizacion,
  crearMensaje,
  crearOt,
  crearTarea,
  crearTicket,
  crearUsuario,
  crearVinculoTelegram,
  fijarPreferencia,
  ingresarComo,
} from '../../test/fabricas.js';
import { crearApp } from '../app.js';
import { dataSource } from '../config/db.js';
import { publicar } from '../core/eventos/dominio.js';
import { conectarDespachador, esperarDespachos } from './despachador.js';

beforeAll(() => conectarDespachador());
afterEach(() => vi.unstubAllEnvs());

interface FilaAviso {
  id: string;
  usuario_id: number;
  evento: string;
  tipo: string;
  clave: string | null;
  texto: string;
  enlace: string;
  entidad: string;
  entidad_id: number;
  datos: Record<string, unknown>;
  actor_id: number | null;
  en_app: boolean;
}

async function avisos(usuario_id?: number): Promise<FilaAviso[]> {
  return usuario_id === undefined
    ? dataSource.query(`SELECT * FROM aviso ORDER BY id`)
    : dataSource.query(`SELECT * FROM aviso WHERE usuario_id = $1 ORDER BY id`, [usuario_id]);
}

// Publica y espera a que el despachador termine.
async function emitir(...args: Parameters<typeof publicar>): Promise<void> {
  publicar(...args);
  await esperarDespachos();
}

describe('despachador: una fila por destinatario con el texto de §4.1', () => {
  it('ticket.asignado → ticket_asignado, solo a los nuevos responsables y nunca al actor', async () => {
    const actor = await crearUsuario({ nombre: 'Camila Rojas' });
    const u = await crearUsuario();
    const t = await crearTicket({ asunto: 'Error al emitir facturas desde el ERP' });
    await emitir('ticket.asignado', {
      ticket_id: t.id,
      usuario_ids: [u.id, actor.id],
      actor_id: actor.id,
    });
    expect(await avisos(actor.id)).toEqual([]);
    expect(await avisos(u.id)).toEqual([
      expect.objectContaining({
        evento: 'asignacion',
        tipo: 'ticket_asignado',
        clave: null,
        texto: `Camila Rojas te asignó ${t.codigo} «Error al emitir facturas desde el ERP»`,
        enlace: `/tickets/${t.id}`,
        entidad: 'ticket',
        entidad_id: t.id,
        datos: { codigo: t.codigo },
        actor_id: actor.id,
        en_app: true,
      }),
    ]);
  });

  it('el asunto se recorta a 80 caracteres con «…»', async () => {
    const u = await crearUsuario();
    const t = await crearTicket({ asunto: 'x'.repeat(200) });
    await emitir('ticket.asignado', { ticket_id: t.id, usuario_ids: [u.id], actor_id: null });
    const [a] = await avisos(u.id);
    expect(a!.texto).toBe(`Te asignaron ${t.codigo} «${'x'.repeat(79)}…»`);
    expect(a!.texto.length).toBeLessThanOrEqual(300);
  });

  it('ticket.seguidor_agregado → seguidor_agregado', async () => {
    const actor = await crearUsuario({ nombre: 'Camila Rojas' });
    const u = await crearUsuario();
    const t = await crearTicket({ asunto: 'Asunto' });
    await emitir('ticket.seguidor_agregado', {
      ticket_id: t.id,
      usuario_ids: [u.id],
      actor_id: actor.id,
    });
    expect(await avisos(u.id)).toEqual([
      expect.objectContaining({
        evento: 'asignacion',
        tipo: 'seguidor_agregado',
        texto: `Camila Rojas te agregó como seguidor de ${t.codigo} «Asunto»`,
        enlace: `/tickets/${t.id}`,
      }),
    ]);
  });

  it('tarea.asignada en ticket y en OT', async () => {
    const actor = await crearUsuario({ nombre: 'Sebastián Díaz' });
    const u = await crearUsuario();
    const t = await crearTicket();
    const ot = await crearOt(t.id);
    const tt = await crearTarea(t.id, { titulo: 'Revisar logs', responsable_id: u.id });
    const to = await crearTarea({ ot_id: ot.id }, { titulo: 'Cargar CAF', responsable_id: u.id });
    await emitir('tarea.asignada', {
      tarea_id: to.id,
      ticket_id: null,
      ot_id: ot.id,
      usuario_id: u.id,
      actor_id: actor.id,
    });
    await emitir('tarea.asignada', {
      tarea_id: tt.id,
      ticket_id: t.id,
      ot_id: null,
      usuario_id: u.id,
      actor_id: actor.id,
    });
    const [deOt, deTicket] = await avisos(u.id);
    expect(deOt).toMatchObject({
      evento: 'asignacion',
      tipo: 'tarea_asignada',
      texto: `Sebastián Díaz te asignó la tarea «Cargar CAF» en ${ot.codigo}`,
      enlace: `/ots/${ot.id}`,
      entidad: 'ot',
      entidad_id: ot.id,
    });
    expect(deTicket).toMatchObject({
      texto: `Sebastián Díaz te asignó la tarea «Revisar logs» en ${t.codigo}`,
      enlace: `/tickets/${t.id}`,
      entidad: 'ticket',
    });
  });

  it('ot.por_aprobar → ot_por_aprobar al aprobador, con clave idempotente', async () => {
    const creador = await crearUsuario({ nombre: 'Valentina Soto' });
    const aprobador = await crearUsuario();
    const t = await crearTicket();
    const ot = await crearOt(t.id, { tipo: 'interna', aprobador_id: aprobador.id });
    await dataSource.query(`UPDATE ot SET creado_por = $1 WHERE id = $2`, [creador.id, ot.id]);
    await emitir('ot.por_aprobar', { ot_id: ot.id, aprobador_id: aprobador.id });
    await emitir('ot.por_aprobar', { ot_id: ot.id, aprobador_id: aprobador.id });
    expect(await avisos(aprobador.id)).toEqual([
      expect.objectContaining({
        evento: 'asignacion',
        tipo: 'ot_por_aprobar',
        clave: `por_aprobar:ot:${ot.id}`,
        texto: `Valentina Soto te pidió aprobar la ${ot.codigo} (interna)`,
        enlace: `/ots/${ot.id}`,
      }),
    ]);
  });

  it('mencion en nota interna de ticket y en seguimiento de OT, con enlace al mensaje', async () => {
    const actor = await crearUsuario({ nombre: 'Camila Rojas' });
    const u = await crearUsuario();
    const t = await crearTicket();
    const ot = await crearOt(t.id);
    const mt = await crearMensaje(t.id, { tipo: 'nota_interna', autor_id: actor.id });
    const mo = await crearMensaje({ ot_id: ot.id }, { tipo: 'seguimiento', autor_id: actor.id });
    await emitir('mencion', {
      mensaje_id: mt.id,
      ticket_id: t.id,
      ot_id: null,
      tipo: 'nota_interna',
      usuario_ids: [u.id],
      actor_id: actor.id,
    });
    await emitir('mencion', {
      mensaje_id: mo.id,
      ticket_id: null,
      ot_id: ot.id,
      tipo: 'seguimiento',
      usuario_ids: [u.id],
      actor_id: actor.id,
    });
    const [a, b] = await avisos(u.id);
    expect(a).toMatchObject({
      evento: 'mencion',
      tipo: 'mencion',
      texto: `Camila Rojas te mencionó en una nota interna de ${t.codigo}`,
      enlace: `/tickets/${t.id}#mensaje-${mt.id}`,
      entidad: 'ticket',
    });
    expect(b).toMatchObject({
      texto: `Camila Rojas te mencionó en un seguimiento de ${ot.codigo}`,
      enlace: `/ots/${ot.id}#mensaje-${mo.id}`,
      entidad: 'ot',
    });
  });

  it('una mención llega a quien no es responsable ni seguidor', async () => {
    const actor = await crearUsuario();
    const ajeno = await crearUsuario();
    const t = await crearTicket({ principal_id: actor.id });
    const m = await crearMensaje(t.id, { autor_id: actor.id });
    await emitir('mencion', {
      mensaje_id: m.id,
      ticket_id: t.id,
      ot_id: null,
      tipo: 'seguimiento',
      usuario_ids: [ajeno.id],
      actor_id: actor.id,
    });
    expect(await avisos(ajeno.id)).toHaveLength(1);
  });

  it('vence_pronto y vencio solo al responsable principal, con hora de Santiago', async () => {
    const principal = await crearUsuario();
    const otro = await crearUsuario();
    const seguidor = await crearUsuario();
    const limite = new Date(Date.now() + 2 * 3600_000);
    const t = await crearTicket({
      asunto: 'Servidor de archivos',
      principal_id: principal.id,
      otros_ids: [otro.id],
      fecha_limite: limite,
    });
    await dataSource.query(`INSERT INTO ticket_seguidor (ticket_id, usuario_id) VALUES ($1, $2)`, [
      t.id,
      seguidor.id,
    ]);
    await emitir('ticket.vence_pronto', { ticket_id: t.id, fecha_limite: limite.toISOString() });
    await emitir('ticket.vencio', { ticket_id: t.id, fecha_limite: limite.toISOString() });
    expect(await avisos(otro.id)).toEqual([]);
    expect(await avisos(seguidor.id)).toEqual([]);
    const [pronto, vencio] = await avisos(principal.id);
    expect(pronto).toMatchObject({
      evento: 'vence_pronto',
      tipo: 'vence_pronto',
      clave: `vence_pronto:ticket:${t.id}:${limite.toISOString()}`,
      enlace: `/tickets/${t.id}`,
    });
    expect(pronto!.texto).toMatch(
      new RegExp(`^${t.codigo} «Servidor de archivos» vence (hoy|mañana) a las \\d\\d:\\d\\d$`),
    );
    expect(vencio).toMatchObject({ evento: 'vencio', tipo: 'vencio' });
    expect(vencio!.texto).toMatch(
      new RegExp(`^${t.codigo} «Servidor de archivos» venció (hoy|mañana) a las \\d\\d:\\d\\d$`),
    );
  });

  it('vencio con fecha pasada: «venció el 15 ene a las 18:00» (hora de Santiago)', async () => {
    const principal = await crearUsuario();
    const t = await crearTicket({ asunto: 'Caída', principal_id: principal.id });
    // 2026-01-15 21:00 UTC = 18:00 en Santiago (UTC-3 en horario de verano)
    await emitir('ticket.vencio', { ticket_id: t.id, fecha_limite: '2026-01-15T21:00:00.000Z' });
    const [a] = await avisos(principal.id);
    expect(a!.texto).toBe(`${t.codigo} «Caída» venció el 15 ene a las 18:00`);
  });

  it('ticket.estado_cambiado → responsables ∪ seguidores; en espera con la etiqueta de espera_de', async () => {
    const actor = await crearUsuario({ nombre: 'Tomás Reyes' });
    const principal = await crearUsuario();
    const seguidor = await crearUsuario();
    const t = await crearTicket({
      estado: 'en_espera',
      espera_de: 'repuesto',
      principal_id: principal.id,
    });
    await dataSource.query(`UPDATE ticket SET espera_detalle = 'DETALLE-XYZ' WHERE id = $1`, [
      t.id,
    ]);
    await dataSource.query(`INSERT INTO ticket_seguidor (ticket_id, usuario_id) VALUES ($1, $2)`, [
      t.id,
      seguidor.id,
    ]);
    await emitir('ticket.estado_cambiado', {
      ticket_id: t.id,
      estado_anterior: 'en_curso',
      estado: 'en_espera',
      actor_id: actor.id,
    });
    for (const id of [principal.id, seguidor.id]) {
      expect(await avisos(id)).toEqual([
        expect.objectContaining({
          evento: 'estado_ticket',
          tipo: 'estado_ticket',
          texto: `Tomás Reyes cambió ${t.codigo} a En espera · repuesto`,
        }),
      ]);
    }
    expect(await avisos(actor.id)).toEqual([]);
    expect((await avisos(principal.id))[0]!.texto).not.toContain('DETALLE-XYZ');
  });

  it('ot.cerrada y ot.cancelada a destinatarios_ids', async () => {
    const u = await crearUsuario();
    const t = await crearTicket();
    const cerrada = await crearOt(t.id, { etapa: 'cerrada', resolvio_ticket: true });
    const abierta = await crearOt(t.id, { etapa: 'cerrada', resolvio_ticket: false });
    const cancelada = await crearOt(t.id, { etapa: 'cancelada' });
    await emitir('ot.cerrada', {
      ot_id: cerrada.id,
      ticket_id: t.id,
      resolvio_ticket: true,
      destinatarios_ids: [u.id],
    });
    await emitir('ot.cerrada', {
      ot_id: abierta.id,
      ticket_id: t.id,
      resolvio_ticket: false,
      destinatarios_ids: [u.id],
    });
    await emitir('ot.cancelada', {
      ot_id: cancelada.id,
      ticket_id: t.id,
      destinatarios_ids: [u.id],
    });
    const filas = await avisos(u.id);
    expect(filas.map((f) => [f.evento, f.tipo, f.clave, f.texto, f.enlace])).toEqual([
      [
        'estado_ticket',
        'ot_cerrada',
        `ot_cerrada:ot:${cerrada.id}`,
        `${cerrada.codigo} se cerró · resolvió el ticket ${t.codigo}`,
        `/ots/${cerrada.id}`,
      ],
      [
        'estado_ticket',
        'ot_cerrada',
        `ot_cerrada:ot:${abierta.id}`,
        `${abierta.codigo} se cerró · el ticket ${t.codigo} sigue abierto`,
        `/ots/${abierta.id}`,
      ],
      [
        'estado_ticket',
        'ot_cancelada',
        `ot_cancelada:ot:${cancelada.id}`,
        `${cancelada.codigo} fue cancelada · ${t.codigo}`,
        `/ots/${cancelada.id}`,
      ],
    ]);
  });

  it('ticket.seguimiento_nuevo → responsables ∪ seguidores; copiado nombra la OT de origen', async () => {
    const actor = await crearUsuario({ nombre: 'Sebastián Díaz' });
    const principal = await crearUsuario();
    const t = await crearTicket({ principal_id: principal.id });
    const ot = await crearOt(t.id);
    const original = await crearMensaje({ ot_id: ot.id }, { autor_id: actor.id });
    const copia = await dataSource.manager.query(
      `INSERT INTO mensaje (ticket_id, copiado_desde_id, tipo, autor_id, texto) VALUES ($1, $2, 'seguimiento', $3, 'x') RETURNING id`,
      [t.id, original.id, actor.id],
    );
    const suelto = await crearMensaje(t.id, { autor_id: actor.id });
    await emitir('ticket.seguimiento_nuevo', {
      ticket_id: t.id,
      mensaje_id: suelto.id,
      actor_id: actor.id,
      copiado: false,
    });
    await emitir('ticket.seguimiento_nuevo', {
      ticket_id: t.id,
      mensaje_id: copia[0].id,
      actor_id: actor.id,
      copiado: true,
    });
    const [a, b] = await avisos(principal.id);
    expect(a).toMatchObject({
      evento: 'seguimiento',
      tipo: 'seguimiento',
      texto: `Sebastián Díaz registró un seguimiento en ${t.codigo}`,
      enlace: `/tickets/${t.id}#mensaje-${suelto.id}`,
    });
    expect(b!.texto).toBe(`Sebastián Díaz copió un seguimiento de ${ot.codigo} a ${t.codigo}`);
  });

  it('cotizacion.respondida → aprobada / rechazada sin montos', async () => {
    const u = await crearUsuario();
    const cliente = await crearCliente({ nombre: 'Viña Santa Clara' });
    const t = await crearTicket({ cliente_id: cliente.id });
    const ot = await crearOt(t.id, { cliente_id: cliente.id });
    const cot = await crearCotizacion(ot.id, {
      estado: 'aprobada',
      lineas: [{ descripcion: 'Servicio', cantidad: 1, precio_unitario: 475000 }],
    });
    await emitir('cotizacion.respondida', {
      ot_id: ot.id,
      cotizacion_id: cot.id,
      resultado: 'aprobada',
      destinatarios_ids: [u.id],
    });
    await emitir('cotizacion.respondida', {
      ot_id: ot.id,
      cotizacion_id: cot.id,
      resultado: 'rechazada',
      destinatarios_ids: [u.id],
    });
    const [ok, no] = await avisos(u.id);
    expect(ok).toMatchObject({
      evento: 'cotizacion',
      tipo: 'cotizacion_aprobada',
      clave: `cotizacion:${cot.id}:aprobada`,
      texto: `El cliente aprobó la cotización ${cot.codigo} v${cot.version} · Viña Santa Clara`,
      enlace: `/cotizaciones/${cot.id}`,
      entidad: 'ot',
      entidad_id: ot.id,
    });
    expect(no).toMatchObject({
      tipo: 'cotizacion_rechazada',
      texto: `El cliente rechazó la cotización ${cot.codigo} v${cot.version} · Viña Santa Clara`,
    });
    expect(ok!.texto).not.toMatch(/475/);
  });

  it('ot.por_facturar → admin y coordinación activos y nadie más; dos veces = un aviso por destinatario', async () => {
    const admin = await crearUsuario({ rol: 'admin' });
    const coord = await crearUsuario({ rol: 'coordinacion' });
    const inactivo = await crearUsuario({ rol: 'coordinacion', activo: false });
    const tecnico = await crearUsuario({ rol: 'tecnico' });
    const lectura = await crearUsuario({ rol: 'lectura' });
    const cliente = await crearCliente({ nombre: 'Clínica Los Robles' });
    const t = await crearTicket();
    const ot = await crearOt(t.id, { etapa: 'cerrada', cliente_id: cliente.id });
    await emitir('ot.por_facturar', { ot_id: ot.id });
    await emitir('ot.por_facturar', { ot_id: ot.id });
    for (const u of [admin, coord]) {
      expect(await avisos(u.id)).toEqual([
        expect.objectContaining({
          evento: 'por_facturar',
          tipo: 'por_facturar',
          clave: `por_facturar:ot:${ot.id}`,
          texto: `${ot.codigo} se cerró y quedó lista para facturar · Clínica Los Robles`,
          enlace: `/ots/${ot.id}`,
        }),
      ]);
    }
    for (const u of [inactivo, tecnico, lectura]) expect(await avisos(u.id)).toEqual([]);
  });
});

describe('despachador: idempotencia, inactivos y preferencias', () => {
  it('vence_pronto dos veces deja una sola fila; si cambia la fecha límite la clave cambia', async () => {
    const principal = await crearUsuario();
    const t = await crearTicket({ principal_id: principal.id });
    const f1 = '2026-10-05T12:00:00.000Z';
    await emitir('ticket.vence_pronto', { ticket_id: t.id, fecha_limite: f1 });
    await emitir('ticket.vence_pronto', { ticket_id: t.id, fecha_limite: f1 });
    expect(await avisos(principal.id)).toHaveLength(1);
    await emitir('ticket.vence_pronto', {
      ticket_id: t.id,
      fecha_limite: '2026-10-06T12:00:00.000Z',
    });
    expect(await avisos(principal.id)).toHaveLength(2);
  });

  it('un usuario inactivo no recibe aviso', async () => {
    const inactivo = await crearUsuario({ activo: false });
    const t = await crearTicket();
    await emitir('ticket.asignado', {
      ticket_id: t.id,
      usuario_ids: [inactivo.id],
      actor_id: null,
    });
    expect(await avisos()).toEqual([]);
  });

  it('con la preferencia de la app apagada la fila se crea con en_app = false', async () => {
    const u = await crearUsuario();
    await fijarPreferencia(u.id, 'asignacion', 'app', false);
    const t = await crearTicket();
    await emitir('ticket.asignado', { ticket_id: t.id, usuario_ids: [u.id], actor_id: null });
    expect(await avisos(u.id)).toEqual([expect.objectContaining({ en_app: false })]);
  });

  it('un evento sobre una entidad inexistente no crea nada ni lanza', async () => {
    const u = await crearUsuario();
    await emitir('ticket.asignado', { ticket_id: 999999, usuario_ids: [u.id], actor_id: null });
    expect(await avisos()).toEqual([]);
  });

  const envios = (): Promise<{ usuario_id: number; estado: string; error: string | null }[]> =>
    dataSource.query(
      `SELECT a.usuario_id, e.estado, e.error FROM aviso_envio e JOIN aviso a ON a.id = e.aviso_id ORDER BY a.id`,
    );

  it('aviso_envio solo con vínculo y preferencia de Telegram activa; con token queda pendiente', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token-de-prueba');
    const vinculado = await crearUsuario();
    const sinVinculo = await crearUsuario();
    const apagado = await crearUsuario();
    await crearVinculoTelegram(vinculado.id);
    await crearVinculoTelegram(apagado.id);
    await fijarPreferencia(apagado.id, 'asignacion', 'telegram', false);
    const t = await crearTicket();
    await emitir('ticket.asignado', {
      ticket_id: t.id,
      usuario_ids: [vinculado.id, sinVinculo.id, apagado.id],
      actor_id: null,
    });
    expect(await avisos()).toHaveLength(3);
    expect(await envios()).toEqual([
      { usuario_id: vinculado.id, estado: 'pendiente', error: null },
    ]);
  });

  it('con vínculo pero sin token: omitido / sin_token', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    const u = await crearUsuario();
    await crearVinculoTelegram(u.id);
    const t = await crearTicket();
    await emitir('ticket.asignado', { ticket_id: t.id, usuario_ids: [u.id], actor_id: null });
    expect(await envios()).toEqual([{ usuario_id: u.id, estado: 'omitido', error: 'sin_token' }]);
  });

  it('estado_ticket y seguimiento no van por Telegram por defecto', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token-de-prueba');
    const u = await crearUsuario();
    await crearVinculoTelegram(u.id);
    const t = await crearTicket({ principal_id: u.id });
    await emitir('ticket.estado_cambiado', {
      ticket_id: t.id,
      estado_anterior: 'nuevo',
      estado: 'en_curso',
      actor_id: null,
    });
    expect(await avisos(u.id)).toHaveLength(1);
    expect(await envios()).toEqual([]);
  });
});

describe('despachador: sin contenido sensible (prueba 12 de §14)', () => {
  it('el texto de una mención no contiene el texto de la nota', async () => {
    const actor = await crearUsuario();
    const u = await crearUsuario();
    const t = await crearTicket();
    const m = await crearMensaje(t.id, {
      tipo: 'nota_interna',
      autor_id: actor.id,
      texto: 'SECRETO-XYZ',
    });
    await emitir('mencion', {
      mensaje_id: m.id,
      ticket_id: t.id,
      ot_id: null,
      tipo: 'nota_interna',
      usuario_ids: [u.id],
      actor_id: actor.id,
    });
    const [a] = await avisos(u.id);
    expect(JSON.stringify(a)).not.toContain('SECRETO-XYZ');
  });

  it('el aviso de estado no contiene el motivo; el de cancelación tampoco', async () => {
    const u = await crearUsuario();
    const t = await crearTicket({ estado: 'descartado', principal_id: u.id });
    await dataSource.query(`UPDATE ticket SET motivo_cierre = 'MOTIVO-XYZ' WHERE id = $1`, [t.id]);
    await emitir('ticket.estado_cambiado', {
      ticket_id: t.id,
      estado_anterior: 'nuevo',
      estado: 'descartado',
      actor_id: null,
    });
    const ot = await crearOt(t.id, { etapa: 'cancelada' });
    await dataSource.query(`UPDATE ot SET motivo_cancelacion = 'MOTIVO-XYZ' WHERE id = $1`, [
      ot.id,
    ]);
    await emitir('ot.cancelada', { ot_id: ot.id, ticket_id: t.id, destinatarios_ids: [u.id] });
    const filas = await avisos(u.id);
    expect(filas).toHaveLength(2);
    expect(JSON.stringify(filas)).not.toContain('MOTIVO-XYZ');
    expect(filas[0]!.texto).toBe(`${t.codigo} cambió a Descartado`);
  });
});

describe('despachador: integración con los servicios', () => {
  const app = () => crearApp({ comprobarBd: async () => true });

  it('una nota interna con mención por la API crea el aviso sin el texto de la nota', async () => {
    const autor = await crearUsuario({ rol: 'tecnico', nombre: 'Sebastián Díaz' });
    const u = await crearUsuario();
    const t = await crearTicket({ estado: 'en_curso' });
    const { agente } = await ingresarComo(app(), autor);
    const r = await agente.post(`/api/tickets/${t.id}/mensajes`).send({
      tipo: 'nota_interna',
      texto: 'SECRETO-XYZ',
      mencionados_ids: [u.id],
      archivo_ids: [],
      horas: null,
    });
    expect(r.status).toBe(201);
    await esperarDespachos();
    expect(await avisos(u.id)).toEqual([
      expect.objectContaining({
        tipo: 'mencion',
        texto: `Sebastián Díaz te mencionó en una nota interna de ${t.codigo}`,
        enlace: `/tickets/${t.id}#mensaje-${r.body.id}`,
      }),
    ]);
    expect(JSON.stringify(await avisos())).not.toContain('SECRETO-XYZ');
  });

  it('con boss encola aviso.enviar por cada aviso pendiente de Telegram', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token-de-prueba');
    const send = vi.fn().mockResolvedValue('job');
    conectarDespachador({ boss: { send } as unknown as PgBoss });
    try {
      const u = await crearUsuario();
      await crearVinculoTelegram(u.id);
      const t = await crearTicket();
      await emitir('ticket.asignado', { ticket_id: t.id, usuario_ids: [u.id], actor_id: null });
      const [a] = await avisos(u.id);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(
        'aviso.enviar',
        { aviso_id: Number(a!.id), canal: 'telegram' },
        { singletonKey: `${a!.id}:telegram` },
      );
    } finally {
      conectarDespachador({ boss: null });
    }
  });

  it('si la cola falla el despachador no lanza y el aviso queda guardado', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token-de-prueba');
    const send = vi.fn().mockRejectedValue(new Error('cola caída'));
    conectarDespachador({ boss: { send } as unknown as PgBoss });
    try {
      const u = await crearUsuario();
      await crearVinculoTelegram(u.id);
      const t = await crearTicket();
      await emitir('ticket.asignado', { ticket_id: t.id, usuario_ids: [u.id], actor_id: null });
      expect(await avisos(u.id)).toHaveLength(1);
    } finally {
      conectarDespachador({ boss: null });
    }
  });
});
