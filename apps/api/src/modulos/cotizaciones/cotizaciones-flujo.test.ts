import { describe, expect, it } from 'vitest';
import {
  crearArchivoPendiente,
  crearBolsa,
  crearCliente,
  crearContacto,
  crearCotizacion,
  crearOt,
  crearPlantilla,
  crearRegistroHoras,
  crearTarea,
  crearTicket,
  crearUsuario,
  fijarTarifas,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { eventosDominio } from '../../core/eventos/dominio.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura' = 'tecnico') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

// OT facturable de un cliente externo con un contacto.
async function otFacturable(
  etapa: 'borrador' | 'cotizada' | 'aprobada' | 'en_ejecucion' = 'borrador',
  ticketDatos: Parameters<typeof crearTicket>[0] = {},
) {
  const cliente = await crearCliente();
  const contacto = await crearContacto(cliente.id);
  const ticket = await crearTicket({ cliente_id: cliente.id, ...ticketDatos });
  const ot = await crearOt(ticket.id, { tipo: 'facturable', etapa, cliente_id: cliente.id });
  return { cliente, contacto, ticket, ot };
}

const LINEAS = [{ cantidad: 2, precio_unitario: 38000 }];

const eventosOt = (id: number) =>
  dataSource.query(
    `SELECT accion, campo, valor_anterior, valor_nuevo, datos FROM evento
      WHERE entidad = 'ot' AND entidad_id = $1 ORDER BY id`,
    [String(id)],
  );

const filaCot = async (id: number) =>
  (await dataSource.query(`SELECT * FROM cotizacion WHERE id = $1`, [id]))[0];

const hoy = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

// Prueba 8 y 7 (enviar)
describe('POST /api/cotizaciones/:id/enviar (§5.7)', () => {
  it('OT en borrador → cotizada, con evento de etapa con cotizacion_id y evento cotizacion_enviada', async () => {
    const { agente, usuario } = await como();
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id, { contacto_id: contacto.id, lineas: LINEAS });
    const r = await agente.post(`/api/cotizaciones/${c.id}/enviar`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      estado: 'enviada',
      editable: false,
      duplicable: true,
      enviada_por: { id: usuario.id },
      ot: { etapa: 'cotizada' },
    });
    expect(r.body.enviada_en).not.toBeNull();
    const evs = await eventosOt(ot.id);
    const etapa = evs.find((e: { campo: string | null }) => e.campo === 'etapa');
    expect(etapa).toMatchObject({
      valor_anterior: 'Borrador',
      valor_nuevo: 'Cotizada',
      datos: { cotizacion_id: c.id, codigo: c.codigo, version: 1 },
    });
    const enviada = evs.find((e: { accion: string }) => e.accion === 'cotizacion_enviada');
    expect(enviada).toMatchObject({
      valor_nuevo: `${c.codigo} v1 · $90.440`,
      datos: { cotizacion_id: c.id, moneda: 'CLP', neto: 76000, total: 90440 },
    });
    const det = await agente.get(`/api/ots/${ot.id}`);
    expect(det.body).toMatchObject({
      etapa: 'cotizada',
      cotizacion: { id: c.id, estado: 'enviada', n_versiones: 1 },
      neto: 76000,
    });
  });

  it('enviar v2 (duplicada de una v1 enviada) deja v1 reemplazada y la OT sigue cotizada', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable('cotizada');
    const v1 = await crearCotizacion(ot.id, {
      estado: 'enviada',
      contacto_id: contacto.id,
      lineas: LINEAS,
    });
    const dup = await agente.post(`/api/cotizaciones/${v1.id}/duplicar`);
    expect(dup.status).toBe(201);
    const antesEtapas = (await eventosOt(ot.id)).filter(
      (e: { campo: string | null }) => e.campo === 'etapa',
    ).length;
    const r = await agente.post(`/api/cotizaciones/${dup.body.id}/enviar`);
    expect(r.status).toBe(200);
    expect((await filaCot(v1.id)).estado).toBe('reemplazada');
    const det = await agente.get(`/api/ots/${ot.id}`);
    expect(det.body.etapa).toBe('cotizada');
    expect(det.body.cotizacion).toMatchObject({ version: 2, estado: 'enviada', n_versiones: 2 });
    const etapas = (await eventosOt(ot.id)).filter(
      (e: { campo: string | null }) => e.campo === 'etapa',
    );
    expect(etapas).toHaveLength(antesEtapas); // no vuelve a cambiar de etapa
    // enviar dos veces → 409
    const otra = await agente.post(`/api/cotizaciones/${dup.body.id}/enviar`);
    expect(otra.status).toBe(409);
    expect(otra.body.error.codigo).toBe('COTIZACION_NO_EDITABLE');
  });

  it('sin líneas o sin contacto → 400; no cambia nada', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    const sinLineas = await crearCotizacion(ot.id, { contacto_id: contacto.id });
    const r1 = await agente.post(`/api/cotizaciones/${sinLineas.id}/enviar`);
    expect(r1.status).toBe(400);
    expect(r1.body.error.detalles).toHaveProperty('lineas');
    await dataSource.query(`DELETE FROM cotizacion WHERE id = $1`, [sinLineas.id]);
    const sinContacto = await crearCotizacion(ot.id, { lineas: LINEAS });
    const r2 = await agente.post(`/api/cotizaciones/${sinContacto.id}/enviar`);
    expect(r2.status).toBe(400);
    expect(r2.body.error.detalles).toHaveProperty('contacto_id');
    expect((await filaCot(sinContacto.id)).estado).toBe('borrador');
    expect((await dataSource.query(`SELECT etapa FROM ot WHERE id = $1`, [ot.id]))[0].etapa).toBe(
      'borrador',
    );
  });

  it('la OT hereda el contacto de la cotización si no tenía', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id, { contacto_id: contacto.id, lineas: LINEAS });
    await agente.post(`/api/cotizaciones/${c.id}/enviar`);
    expect((await agente.get(`/api/ots/${ot.id}`)).body.contacto).toMatchObject({
      id: contacto.id,
    });
  });

  it('una versión no vigente → 409 NO_EDITABLE; en una OT aprobada → 409 TRANSICION_INVALIDA', async () => {
    const { agente } = await como();
    const a = await otFacturable('cotizada');
    const v1 = await crearCotizacion(a.ot.id, {
      estado: 'reemplazada',
      contacto_id: a.contacto.id,
      lineas: LINEAS,
    });
    await crearCotizacion(a.ot.id, { contacto_id: a.contacto.id, lineas: LINEAS });
    const r = await agente.post(`/api/cotizaciones/${v1.id}/enviar`);
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('COTIZACION_NO_EDITABLE');

    const b = await otFacturable('aprobada');
    const borrador = await crearCotizacion(b.ot.id, { contacto_id: b.contacto.id, lineas: LINEAS });
    const r2 = await agente.post(`/api/cotizaciones/${borrador.id}/enviar`);
    expect(r2.status).toBe(409);
    expect(r2.body.error.codigo).toBe('TRANSICION_INVALIDA');
    expect((await filaCot(borrador.id)).estado).toBe('borrador');
    expect((await agente.post('/api/cotizaciones/999999/enviar')).status).toBe(404);
  });
});

describe('POST /api/cotizaciones/:id/duplicar (§5.8)', () => {
  it('copia encabezado y líneas como borrador vN+1 conservando el iva_pct original', async () => {
    const { agente, usuario } = await como();
    const { ot, contacto } = await otFacturable('cotizada');
    const v1 = await crearCotizacion(ot.id, {
      estado: 'enviada',
      contacto_id: contacto.id,
      iva_pct: 10,
      fecha_emision: '2026-01-05',
      validez_dias: 15,
      condiciones: 'Pago a 30 días',
      nota_interna: 'Nota',
      lineas: [
        { cantidad: 2, precio_unitario: 38000, descripcion: 'Uno' },
        { cantidad: 1, precio_unitario: 1000, descuento_pct: 10, descripcion: 'Dos' },
      ],
    });
    await fijarTarifas({ iva_pct: 19 });
    const r = await agente.post(`/api/cotizaciones/${v1.id}/duplicar`);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      codigo: v1.codigo,
      version: 2,
      estado: 'borrador',
      iva_pct: 10,
      fecha_emision: hoy(),
      validez_dias: 15,
      condiciones: 'Pago a 30 días',
      nota_interna: 'Nota',
      contacto: { id: contacto.id },
      creado_por: { id: usuario.id },
      vigente: true,
      editable: true,
      totales: { neto: 76900, iva: 7690, total: 84590 },
    });
    expect(r.body.lineas.map((l: { descripcion: string }) => l.descripcion)).toEqual([
      'Uno',
      'Dos',
    ]);
    // la original conserva su estado y deja de ser vigente
    const orig = await agente.get(`/api/cotizaciones/${v1.id}`);
    expect(orig.body).toMatchObject({ estado: 'enviada', vigente: false, duplicable: false });
    const evs = await eventosOt(ot.id);
    expect(evs.find((e: { accion: string }) => e.accion === 'cotizacion_creada')).toMatchObject({
      valor_nuevo: `${v1.codigo} v2`,
      datos: { cotizacion_id: r.body.id, version: 2, desde_version: 1 },
    });
  });

  it('desde una borrador → 409; no vigente → 409; aprobada u OT en ejecución → COTIZACION_APROBADA', async () => {
    const { agente } = await como();
    const a = await otFacturable();
    const borrador = await crearCotizacion(a.ot.id);
    const r1 = await agente.post(`/api/cotizaciones/${borrador.id}/duplicar`);
    expect(r1.status).toBe(409);
    expect(r1.body.error.codigo).toBe('COTIZACION_NO_EDITABLE');

    const b = await otFacturable('cotizada');
    const v1 = await crearCotizacion(b.ot.id, { estado: 'reemplazada' });
    await crearCotizacion(b.ot.id, { estado: 'enviada' });
    expect((await agente.post(`/api/cotizaciones/${v1.id}/duplicar`)).status).toBe(409);

    const c = await otFacturable('aprobada');
    const aprobada = await crearCotizacion(c.ot.id, { estado: 'aprobada' });
    const r3 = await agente.post(`/api/cotizaciones/${aprobada.id}/duplicar`);
    expect(r3.status).toBe(409);
    expect(r3.body.error.codigo).toBe('COTIZACION_APROBADA');

    const d = await otFacturable('en_ejecucion');
    const enEjecucion = await crearCotizacion(d.ot.id, { estado: 'enviada' });
    expect(
      (await agente.post(`/api/cotizaciones/${enEjecucion.id}/duplicar`)).body.error.codigo,
    ).toBe('COTIZACION_APROBADA');
  });
});

describe('DELETE /api/cotizaciones/:id (§5.9)', () => {
  it('elimina el borrador vigente; la OT queda sin cotización y se puede crear otra', async () => {
    const { agente } = await como();
    const { ot } = await otFacturable();
    const c = await crearCotizacion(ot.id, { lineas: LINEAS });
    const r = await agente.delete(`/api/cotizaciones/${c.id}`);
    expect(r.status).toBe(204);
    expect(await dataSource.query(`SELECT 1 FROM cotizacion WHERE id = $1`, [c.id])).toHaveLength(
      0,
    );
    expect(
      await dataSource.query(`SELECT 1 FROM linea_cotizacion WHERE cotizacion_id = $1`, [c.id]),
    ).toHaveLength(0);
    const evs = await eventosOt(ot.id);
    expect(evs.at(-1)).toMatchObject({
      accion: 'cotizacion_eliminada',
      datos: { cotizacion_id: c.id, codigo: c.codigo, version: 1 },
    });
    expect((await agente.get(`/api/ots/${ot.id}`)).body).toMatchObject({
      cotizacion: null,
      puede_cotizar: true,
    });
    expect((await agente.post(`/api/ots/${ot.id}/cotizaciones`)).status).toBe(201);
  });

  it('una enviada o una no vigente → 409 y no se borra', async () => {
    const { agente } = await como();
    const { ot } = await otFacturable('cotizada');
    const v1 = await crearCotizacion(ot.id, { estado: 'enviada' });
    expect((await agente.delete(`/api/cotizaciones/${v1.id}`)).status).toBe(409);
    await dataSource.query(`UPDATE cotizacion SET estado = 'reemplazada' WHERE id = $1`, [v1.id]);
    await crearCotizacion(ot.id);
    const r = await agente.delete(`/api/cotizaciones/${v1.id}`);
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('COTIZACION_NO_EDITABLE');
    expect(await filaCot(v1.id)).toBeDefined();
    expect((await agente.delete('/api/cotizaciones/999999')).status).toBe(404);
  });
});

// Prueba 13
describe('POST /api/cotizaciones/:id/importar-horas (§5.5)', () => {
  it('sin tarifa global ni del cliente → 409 TARIFA_FALTANTE', async () => {
    await fijarTarifas({ hora_normal: null });
    const { agente } = await como();
    const { ot } = await otFacturable();
    await crearTarea({ ot_id: ot.id }, { horas_estimadas: 3 });
    const c = await crearCotizacion(ot.id);
    const r = await agente.post(`/api/cotizaciones/${c.id}/importar-horas`).send({});
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TARIFA_FALTANTE');
    expect(r.body.error.detalles).toEqual({ concepto: 'hora_normal' });
  });

  it('tarifa del cliente (40.000) gana a la global (38.000); sin ella se usa la global', async () => {
    await fijarTarifas({ hora_normal: 38000 });
    const { agente } = await como();
    const a = await otFacturable();
    const b = await otFacturable();
    await dataSource.query(
      `INSERT INTO tarifa_cliente (cliente_id, concepto, valor) VALUES ($1, 'hora_normal', 40000)`,
      [a.cliente.id],
    );
    for (const { ot } of [a, b]) {
      await crearTarea({ ot_id: ot.id }, { titulo: 'Diagnóstico', horas_estimadas: 3 });
      await crearTarea(
        { ot_id: ot.id },
        { titulo: 'Pruebas', horas_estimadas: 4.5, horas_reales: 5 },
      );
      await crearTarea({ ot_id: ot.id }, { titulo: 'Sin horas' });
    }
    const ca = await crearCotizacion(a.ot.id);
    const cb = await crearCotizacion(b.ot.id);
    const ra = await agente.post(`/api/cotizaciones/${ca.id}/importar-horas`).send({});
    expect(ra.status).toBe(200);
    expect(
      ra.body.lineas.map((l: Record<string, unknown>) => [
        l.descripcion,
        l.cantidad,
        l.precio_unitario,
        l.tipo,
        l.unidad,
      ]),
    ).toEqual([
      ['Diagnóstico', 3, 40000, 'mano_de_obra', 'h'],
      ['Pruebas', 4.5, 40000, 'mano_de_obra', 'h'],
    ]);
    expect(ra.body.totales.neto).toBe(300000);
    const rb = await agente.post(`/api/cotizaciones/${cb.id}/importar-horas`).send({});
    expect(rb.body.lineas.map((l: { precio_unitario: number }) => l.precio_unitario)).toEqual([
      38000, 38000,
    ]);
    // las líneas se agregan al final de las existentes
    const otra = await agente
      .post(`/api/cotizaciones/${cb.id}/importar-horas`)
      .send({ origen: 'reales' });
    expect(otra.body.lineas).toHaveLength(3);
    expect(otra.body.lineas[2]).toMatchObject({ descripcion: 'Pruebas', cantidad: 5, orden: 3 });
    const evs = (await eventosOt(b.ot.id)).filter(
      (e: { accion: string }) => e.accion === 'cotizacion_lineas_agregadas',
    );
    expect(evs).toHaveLength(2);
    expect(evs[1].datos).toMatchObject({ cotizacion_id: cb.id, n: 1, origen: 'tareas' });
  });

  it('tareas sin horas → 400; cotización en UF → 400; no editable → 409', async () => {
    await fijarTarifas({ hora_normal: 38000 });
    const { agente } = await como();
    const { ot } = await otFacturable();
    await crearTarea({ ot_id: ot.id }, { titulo: 'Sin horas' });
    const c = await crearCotizacion(ot.id);
    const r = await agente.post(`/api/cotizaciones/${c.id}/importar-horas`).send({});
    expect(r.status).toBe(400);
    expect(r.body.error.detalles).toHaveProperty('origen');
    const reales = await agente
      .post(`/api/cotizaciones/${c.id}/importar-horas`)
      .send({ origen: 'reales' });
    expect(reales.status).toBe(400);
    await crearTarea({ ot_id: ot.id }, { horas_estimadas: 2 });
    await dataSource.query(`UPDATE cotizacion SET moneda = 'UF', valor_uf = 38000 WHERE id = $1`, [
      c.id,
    ]);
    const uf = await agente.post(`/api/cotizaciones/${c.id}/importar-horas`).send({});
    expect(uf.status).toBe(400);
    expect(uf.body.error.detalles).toHaveProperty('moneda');
    const enviada = await otFacturable('cotizada');
    const ce = await crearCotizacion(enviada.ot.id, { estado: 'enviada' });
    expect((await agente.post(`/api/cotizaciones/${ce.id}/importar-horas`).send({})).status).toBe(
      409,
    );
  });
});

describe('POST /api/cotizaciones/:id/importar-horas con origen registradas (F5-T13)', () => {
  const importar = (agente: Awaited<ReturnType<typeof como>>['agente'], id: number) =>
    agente.post(`/api/cotizaciones/${id}/importar-horas`).send({ origen: 'registradas' });
  const resumen = (lineas: Record<string, unknown>[]) =>
    lineas.map((l) => [l.descripcion, l.cantidad, l.precio_unitario, l.tipo, l.unidad]);

  it('una línea por tarea a hora normal, otra fuera de horario a extendida y una "sin tarea"', async () => {
    await fijarTarifas({ hora_normal: 38000, hora_extendida: 45000 });
    const { agente, usuario } = await como();
    const { ot, cliente } = await otFacturable();
    await dataSource.query(
      `INSERT INTO tarifa_cliente (cliente_id, concepto, valor) VALUES ($1, 'hora_extendida', 50000)`,
      [cliente.id],
    );
    const t1 = await crearTarea({ ot_id: ot.id }, { titulo: 'Diagnóstico' });
    const t2 = await crearTarea({ ot_id: ot.id }, { titulo: 'Pruebas' });
    await crearTarea({ ot_id: ot.id }, { titulo: 'Sin registros' });
    const reg = (d: Parameters<typeof crearRegistroHoras>[1]) =>
      crearRegistroHoras(usuario.id, { ot_id: ot.id, ...d });
    await reg({ tarea_id: t1.id, horas: 2 });
    await reg({ tarea_id: t1.id, horas: 1.5, fecha: '2026-01-05' });
    await reg({ tarea_id: t1.id, horas: 1, fuera_de_horario: true, fecha: '2026-01-06' });
    await reg({ tarea_id: t2.id, horas: 0.75, fuera_de_horario: true });
    await reg({ horas: 3 });
    await reg({ horas: 2, fuera_de_horario: true, fecha: '2026-01-07' });
    // horas de ticket (sin OT) o de otra OT no cuentan
    await crearRegistroHoras(usuario.id, { ticket_id: ot.ticket_id, horas: 9 });
    const c = await crearCotizacion(ot.id);
    const r = await importar(agente, c.id);
    expect(r.status).toBe(200);
    expect(resumen(r.body.lineas)).toEqual([
      ['Diagnóstico', 3.5, 38000, 'mano_de_obra', 'h'],
      ['Diagnóstico (fuera de horario)', 1, 50000, 'mano_de_obra', 'h'],
      ['Pruebas (fuera de horario)', 0.75, 50000, 'mano_de_obra', 'h'],
      ['Horas registradas sin tarea', 3, 38000, 'mano_de_obra', 'h'],
      ['Horas registradas sin tarea (fuera de horario)', 2, 50000, 'mano_de_obra', 'h'],
    ]);
    const evs = (await eventosOt(ot.id)).filter(
      (e: { accion: string }) => e.accion === 'cotizacion_lineas_agregadas',
    );
    expect(evs[0].datos).toMatchObject({ cotizacion_id: c.id, n: 5, origen: 'registradas' });
  });

  it('sin tarifa del cliente usa la extendida global; con solo horas normales no exige extendida', async () => {
    await fijarTarifas({ hora_normal: 38000, hora_extendida: 45000 });
    const { agente, usuario } = await como();
    const a = await otFacturable();
    const ta = await crearTarea({ ot_id: a.ot.id }, { titulo: 'Soporte' });
    await crearRegistroHoras(usuario.id, {
      ot_id: a.ot.id,
      tarea_id: ta.id,
      horas: 2,
      fuera_de_horario: true,
    });
    const ca = await crearCotizacion(a.ot.id);
    const ra = await importar(agente, ca.id);
    expect(resumen(ra.body.lineas)).toEqual([
      ['Soporte (fuera de horario)', 2, 45000, 'mano_de_obra', 'h'],
    ]);
    await fijarTarifas({ hora_normal: 38000, hora_extendida: null });
    const b = await otFacturable();
    const tb = await crearTarea({ ot_id: b.ot.id }, { titulo: 'Soporte' });
    await crearRegistroHoras(usuario.id, { ot_id: b.ot.id, tarea_id: tb.id, horas: 2 });
    const cb = await crearCotizacion(b.ot.id);
    const rb = await importar(agente, cb.id);
    expect(rb.status).toBe(200);
    expect(resumen(rb.body.lineas)).toEqual([['Soporte', 2, 38000, 'mano_de_obra', 'h']]);
  });

  it('horas fuera de horario sin tarifa extendida → 409 TARIFA_FALTANTE { concepto: hora_extendida }', async () => {
    await fijarTarifas({ hora_normal: 38000, hora_extendida: null });
    const { agente, usuario } = await como();
    const { ot } = await otFacturable();
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, horas: 2, fuera_de_horario: true });
    const c = await crearCotizacion(ot.id);
    const r = await importar(agente, c.id);
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TARIFA_FALTANTE');
    expect(r.body.error.detalles).toEqual({ concepto: 'hora_extendida' });
    expect((await agente.get(`/api/cotizaciones/${c.id}`)).body.lineas).toHaveLength(0);
  });

  it('sin horas registradas → 400 origen; UF → 400 moneda; sin tarifa normal → 409; las otras fuentes no cambian', async () => {
    await fijarTarifas({ hora_normal: 38000, hora_extendida: 45000 });
    const { agente, usuario } = await como();
    const { ot } = await otFacturable();
    await crearTarea({ ot_id: ot.id }, { titulo: 'Con estimadas', horas_estimadas: 2 });
    const c = await crearCotizacion(ot.id);
    const vacio = await importar(agente, c.id);
    expect(vacio.status).toBe(400);
    expect(vacio.body.error.detalles).toHaveProperty('origen');
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, horas: 1 });
    await dataSource.query(`UPDATE cotizacion SET moneda = 'UF', valor_uf = 38000 WHERE id = $1`, [
      c.id,
    ]);
    const uf = await importar(agente, c.id);
    expect(uf.status).toBe(400);
    expect(uf.body.error.detalles).toHaveProperty('moneda');
    await dataSource.query(`UPDATE cotizacion SET moneda = 'CLP', valor_uf = NULL WHERE id = $1`, [
      c.id,
    ]);
    await fijarTarifas({ hora_normal: null });
    const sin = await importar(agente, c.id);
    expect(sin.status).toBe(409);
    expect(sin.body.error.detalles).toEqual({ concepto: 'hora_normal' });
    await fijarTarifas({ hora_normal: 38000 });
    const est = await agente.post(`/api/cotizaciones/${c.id}/importar-horas`).send({});
    expect(resumen(est.body.lineas)).toEqual([['Con estimadas', 2, 38000, 'mano_de_obra', 'h']]);
  });
});

// Prueba 14
describe('POST /api/cotizaciones/:id/aplicar-plantilla (§5.6)', () => {
  it('plantilla inactiva o inexistente → 400', async () => {
    const { agente } = await como();
    const { ot } = await otFacturable();
    const c = await crearCotizacion(ot.id);
    const p = await crearPlantilla({ lineas: [{ unidad: 'un', precio_unitario: 100 }] });
    await dataSource.query(`UPDATE plantilla_cotizacion SET activo = false WHERE id = $1`, [p.id]);
    const r = await agente
      .post(`/api/cotizaciones/${c.id}/aplicar-plantilla`)
      .send({ plantilla_id: p.id });
    expect(r.status).toBe(400);
    expect(r.body.error.detalles).toHaveProperty('plantilla_id');
    expect(
      (
        await agente
          .post(`/api/cotizaciones/${c.id}/aplicar-plantilla`)
          .send({ plantilla_id: 999999 })
      ).status,
    ).toBe(400);
  });

  it('línea h sin tarifa → 409 TARIFA_FALTANTE hora_normal; km sin tarifa → traslado_km', async () => {
    await fijarTarifas({ hora_normal: null, traslado_km: null });
    const { agente } = await como();
    const { ot } = await otFacturable();
    const c = await crearCotizacion(ot.id);
    const h = await crearPlantilla({ lineas: [{ unidad: 'h' }] });
    const r = await agente
      .post(`/api/cotizaciones/${c.id}/aplicar-plantilla`)
      .send({ plantilla_id: h.id });
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TARIFA_FALTANTE');
    expect(r.body.error.detalles).toEqual({ concepto: 'hora_normal' });
    const km = await crearPlantilla({ lineas: [{ unidad: 'km', tipo: 'traslado' }] });
    const r2 = await agente
      .post(`/api/cotizaciones/${c.id}/aplicar-plantilla`)
      .send({ plantilla_id: km.id });
    expect(r2.body.error.detalles).toEqual({ concepto: 'traslado_km' });
  });

  it('precio de la plantilla o tarifa vigente; un/gl sin precio → 0; copia condiciones si faltaban', async () => {
    await fijarTarifas({ hora_normal: 38000, traslado_km: 900 });
    const { agente } = await como();
    const { ot, cliente } = await otFacturable();
    await dataSource.query(
      `INSERT INTO tarifa_cliente (cliente_id, concepto, valor) VALUES ($1, 'traslado_km', 1000)`,
      [cliente.id],
    );
    const c = await crearCotizacion(ot.id);
    const p = await crearPlantilla({
      lineas: [
        { unidad: 'h', cantidad: 2, descripcion: 'Horas' },
        { unidad: 'km', tipo: 'traslado', cantidad: 10, descripcion: 'Traslado' },
        { unidad: 'un', tipo: 'material', descripcion: 'Material sin precio' },
        {
          unidad: 'gl',
          tipo: 'servicio',
          precio_unitario: 5000,
          descripcion: 'Con precio',
          descuento_pct: 10,
        },
      ],
    });
    await dataSource.query(
      `UPDATE plantilla_cotizacion SET condiciones = 'Condiciones de la plantilla' WHERE id = $1`,
      [p.id],
    );
    const r = await agente
      .post(`/api/cotizaciones/${c.id}/aplicar-plantilla`)
      .send({ plantilla_id: p.id });
    expect(r.status).toBe(200);
    expect(
      r.body.lineas.map((l: { descripcion: string; precio_unitario: number }) => [
        l.descripcion,
        l.precio_unitario,
      ]),
    ).toEqual([
      ['Horas', 38000],
      ['Traslado', 1000],
      ['Material sin precio', 0],
      ['Con precio', 5000],
    ]);
    expect(r.body.condiciones).toBe('Condiciones de la plantilla');
    expect(r.body.totales.neto).toBe(76000 + 10000 + 0 + 4500);
    const ev = (await eventosOt(ot.id)).find(
      (e: { accion: string }) => e.accion === 'cotizacion_lineas_agregadas',
    );
    expect(ev.datos).toMatchObject({ n: 4, origen: 'plantilla', plantilla_id: p.id });
    // las condiciones existentes no se pisan
    const otra = await agente
      .post(`/api/cotizaciones/${c.id}/aplicar-plantilla`)
      .send({ plantilla_id: p.id });
    expect(otra.body.condiciones).toBe('Condiciones de la plantilla');
    expect(otra.body.lineas).toHaveLength(8);
  });
});

// Prueba 9
describe('aprobación del cliente exige y congela la cotización (§6.2)', () => {
  const cuerpo = async (usuarioId: number, contactoId: number) => ({
    contacto_id: contactoId,
    fecha: '2026-09-28',
    forma: 'correo',
    archivo_id: (await crearArchivoPendiente(usuarioId)).id,
  });

  it('sin cotización → 409 COTIZACION_REQUERIDA; con borrador → detalles.cotizacion.estado borrador', async () => {
    const { agente, usuario } = await como('coordinacion');
    const { ot, contacto } = await otFacturable('cotizada');
    const sin = await agente
      .put(`/api/ots/${ot.id}/aprobacion`)
      .send(await cuerpo(usuario.id, contacto.id));
    expect(sin.status).toBe(409);
    expect(sin.body.error.codigo).toBe('COTIZACION_REQUERIDA');
    expect(sin.body.error.detalles).toEqual({ cotizacion: null });

    const borrador = await crearCotizacion(ot.id, { lineas: LINEAS });
    const con = await agente
      .put(`/api/ots/${ot.id}/aprobacion`)
      .send(await cuerpo(usuario.id, contacto.id));
    expect(con.status).toBe(409);
    expect(con.body.error.codigo).toBe('COTIZACION_REQUERIDA');
    expect(con.body.error.detalles.cotizacion).toEqual({
      id: borrador.id,
      version: 1,
      estado: 'borrador',
    });
    expect((await dataSource.query(`SELECT etapa FROM ot WHERE id = $1`, [ot.id]))[0].etapa).toBe(
      'cotizada',
    );
  });

  it('con la vigente enviada → aprobada con aprobada_en; luego duplicar, editar y crear → 409', async () => {
    const { agente, usuario } = await como('coordinacion');
    const { ot, contacto } = await otFacturable('cotizada');
    const c = await crearCotizacion(ot.id, {
      estado: 'enviada',
      contacto_id: contacto.id,
      lineas: [{ cantidad: 1, precio_unitario: 475000 }],
    });
    const r = await agente
      .put(`/api/ots/${ot.id}/aprobacion`)
      .send(await cuerpo(usuario.id, contacto.id));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      etapa: 'aprobada',
      neto: 475000,
      cotizacion: { id: c.id, estado: 'aprobada', n_versiones: 1 },
    });
    const fila = await filaCot(c.id);
    expect(fila.estado).toBe('aprobada');
    expect(fila.aprobada_en).not.toBeNull();
    const evs = await eventosOt(ot.id);
    expect(evs.map((e: { accion: string }) => e.accion)).toEqual(['cotizacion_aprobada', 'cambio']);
    expect(evs[0]).toMatchObject({
      valor_nuevo: `${c.codigo} v1 · $565.250`,
      datos: { cotizacion_id: c.id, version: 1, moneda: 'CLP', neto: 475000, total: 565250 },
    });
    const dup = await agente.post(`/api/cotizaciones/${c.id}/duplicar`);
    expect(dup.status).toBe(409);
    expect(dup.body.error.codigo).toBe('COTIZACION_APROBADA');
    const put = await agente.put(`/api/cotizaciones/${c.id}`).send({
      contacto_id: contacto.id,
      fecha_emision: hoy(),
      validez_dias: 30,
      moneda: 'CLP',
      valor_uf: null,
      aplica_iva: true,
      condiciones: null,
      nota_interna: null,
      lineas: [],
    });
    expect(put.status).toBe(409);
    expect(put.body.error.codigo).toBe('COTIZACION_NO_EDITABLE');
    const crear = await agente.post(`/api/ots/${ot.id}/cotizaciones`);
    expect(crear.status).toBe(409);
  });
});

// Prueba 10 y 11
describe('"Volver a borrador" rechaza la cotización vigente (§6.2)', () => {
  it('vigente enviada → rechazada con evento y evento de dominio; luego duplicar → v2 borrador', async () => {
    const { agente } = await como();
    const principal = await crearUsuario();
    const { ot, contacto, ticket } = await otFacturable('cotizada', { principal_id: principal.id });
    const c = await crearCotizacion(ot.id, {
      estado: 'enviada',
      contacto_id: contacto.id,
      lineas: LINEAS,
    });
    const recibidos: unknown[] = [];
    const oyente = (d: unknown) => recibidos.push(d);
    eventosDominio.on('cotizacion.respondida', oyente);
    try {
      const r = await agente.post(`/api/ots/${ot.id}/cambiar-etapa`).send({ etapa: 'borrador' });
      expect(r.status).toBe(200);
      expect(r.body.etapa).toBe('borrador');
      expect(r.body.cotizacion).toMatchObject({ id: c.id, estado: 'rechazada' });
      const fila = await filaCot(c.id);
      expect(fila.estado).toBe('rechazada');
      expect(fila.rechazada_en).not.toBeNull();
      const evs = await eventosOt(ot.id);
      expect(evs.map((e: { accion: string }) => e.accion)).toEqual([
        'cotizacion_rechazada',
        'cambio',
      ]);
      expect(evs[0].datos).toEqual({ cotizacion_id: c.id, codigo: c.codigo, version: 1 });
      expect(recibidos).toEqual([
        {
          ot_id: ot.id,
          cotizacion_id: c.id,
          resultado: 'rechazada',
          destinatarios_ids: [principal.id],
        },
      ]);
      void ticket;
    } finally {
      eventosDominio.off('cotizacion.respondida', oyente);
    }
    const dup = await agente.post(`/api/cotizaciones/${c.id}/duplicar`);
    expect(dup.status).toBe(201);
    expect(dup.body).toMatchObject({ version: 2, estado: 'borrador' });
  });

  it('vigente en borrador (v2 en preparación) o sin cotización: no toca cotizaciones ni publica', async () => {
    const { agente } = await como();
    const recibidos: unknown[] = [];
    const oyente = (d: unknown) => recibidos.push(d);
    eventosDominio.on('cotizacion.respondida', oyente);
    try {
      const a = await otFacturable('cotizada');
      const v1 = await crearCotizacion(a.ot.id, { estado: 'reemplazada' });
      const v2 = await crearCotizacion(a.ot.id);
      expect(
        (await agente.post(`/api/ots/${a.ot.id}/cambiar-etapa`).send({ etapa: 'borrador' })).status,
      ).toBe(200);
      expect((await filaCot(v1.id)).estado).toBe('reemplazada');
      expect((await filaCot(v2.id)).estado).toBe('borrador');
      const b = await otFacturable('cotizada');
      expect(
        (await agente.post(`/api/ots/${b.ot.id}/cambiar-etapa`).send({ etapa: 'borrador' })).status,
      ).toBe(200);
      expect(recibidos).toEqual([]);
    } finally {
      eventosDominio.off('cotizacion.respondida', oyente);
    }
  });

  it('cambiar-etapa { etapa: "cotizada" } → 400 (la marca manual desapareció)', async () => {
    const { agente } = await como();
    const { ot } = await otFacturable();
    const r = await agente.post(`/api/ots/${ot.id}/cambiar-etapa`).send({ etapa: 'cotizada' });
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('VALIDACION');
  });
});

// Prueba 20
describe('evento de dominio cotizacion.respondida (§6.2)', () => {
  it('llega con destinatarios = responsables ∪ seguidores y solo después del commit', async () => {
    const { agente, usuario } = await como('coordinacion');
    const principal = await crearUsuario();
    const otro = await crearUsuario();
    const seguidor = await crearUsuario();
    const { ot, contacto, ticket } = await otFacturable('cotizada', {
      principal_id: principal.id,
      otros_ids: [otro.id],
    });
    await dataSource.query(`INSERT INTO ticket_seguidor (ticket_id, usuario_id) VALUES ($1, $2)`, [
      ticket.id,
      seguidor.id,
    ]);
    const c = await crearCotizacion(ot.id, {
      estado: 'enviada',
      contacto_id: contacto.id,
      lineas: LINEAS,
    });
    const recibidos: { resultado: string; destinatarios_ids: number[] }[] = [];
    const oyente = (d: (typeof recibidos)[number]) => recibidos.push(d);
    eventosDominio.on('cotizacion.respondida', oyente);
    try {
      // transacción que falla (contacto de otro cliente): no se publica y la cotización no cambia
      const ajeno = await crearContacto((await crearCliente()).id);
      const mala = await agente.put(`/api/ots/${ot.id}/aprobacion`).send({
        contacto_id: ajeno.id,
        fecha: '2026-09-28',
        forma: 'correo',
        archivo_id: (await crearArchivoPendiente(usuario.id)).id,
      });
      expect(mala.status).toBe(400);
      expect(recibidos).toHaveLength(0);
      expect((await filaCot(c.id)).estado).toBe('enviada');

      const ok = await agente.put(`/api/ots/${ot.id}/aprobacion`).send({
        contacto_id: contacto.id,
        fecha: '2026-09-28',
        forma: 'correo',
        archivo_id: (await crearArchivoPendiente(usuario.id)).id,
      });
      expect(ok.status).toBe(200);
      expect(recibidos).toHaveLength(1);
      expect(recibidos[0]!.resultado).toBe('aprobada');
      expect([...recibidos[0]!.destinatarios_ids].sort()).toEqual(
        [principal.id, otro.id, seguidor.id].sort(),
      );
    } finally {
      eventosDominio.off('cotizacion.respondida', oyente);
    }
  });
});

// Prueba 12
describe('regla mínima de bolsa (§6.3)', () => {
  it('descuenta_bolsa: true con contrato fijado no lo cambia ni deja evento; false → true re-resuelve', async () => {
    const { agente } = await como('tecnico');
    const cliente = await crearCliente();
    const ticket = await crearTicket({ cliente_id: cliente.id });
    const a = await crearBolsa(cliente.id, { vigente_desde: '2020-01-01' });
    await dataSource.query(
      `UPDATE contrato_bolsa SET vigente_hasta = (now() AT TIME ZONE 'America/Santiago')::date - 1 WHERE id = $1`,
      [a.id],
    );
    const b = await crearBolsa(cliente.id, { vigente_desde: hoy() });
    const ot = await crearOt(ticket.id, {
      tipo: 'facturable',
      etapa: 'aprobada',
      cliente_id: cliente.id,
      contrato_id: a.id,
    });
    const contrato = async () =>
      (await dataSource.query(`SELECT contrato_id FROM ot WHERE id = $1`, [ot.id]))[0].contrato_id;

    const antes = (await eventosOt(ot.id)).length;
    const r = await agente.patch(`/api/ots/${ot.id}`).send({ descuenta_bolsa: true });
    expect(r.status).toBe(200);
    expect(await contrato()).toBe(a.id);
    expect(await eventosOt(ot.id)).toHaveLength(antes);

    await dataSource.query(`UPDATE ot SET etapa = 'borrador' WHERE id = $1`, [ot.id]);
    expect((await agente.patch(`/api/ots/${ot.id}`).send({ descuenta_bolsa: false })).status).toBe(
      200,
    );
    expect(await contrato()).toBeNull();
    expect((await agente.patch(`/api/ots/${ot.id}`).send({ descuenta_bolsa: true })).status).toBe(
      200,
    );
    expect(await contrato()).toBe(b.id);
  });

  it('descuenta_bolsa: true con contrato null sigue resolviendo el vigente (400 si no hay)', async () => {
    const { agente } = await como('tecnico');
    const sin = await otFacturable();
    const r = await agente.patch(`/api/ots/${sin.ot.id}`).send({ descuenta_bolsa: true });
    expect(r.status).toBe(400);
    expect(r.body.error.detalles).toHaveProperty('descuenta_bolsa');
    const bolsa = await crearBolsa(sin.cliente.id);
    const ok = await agente.patch(`/api/ots/${sin.ot.id}`).send({ descuenta_bolsa: true });
    expect(ok.status).toBe(200);
    expect(ok.body.bolsa).toMatchObject({ contrato_id: bolsa.id });
  });
});
