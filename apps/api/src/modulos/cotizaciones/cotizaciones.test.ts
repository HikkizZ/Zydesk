import { efectosCierreOt } from '@zydesk/shared';
import { describe, expect, it } from 'vitest';
import {
  crearCliente,
  crearContacto,
  crearCotizacion,
  crearOt,
  crearTicket,
  crearUsuario,
  fijarTarifas,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { netoVigenteClp } from './cotizaciones.consulta.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura' = 'tecnico') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

// OT facturable de un cliente externo con un contacto, lista para cotizar.
async function otFacturable(
  etapa: 'borrador' | 'cotizada' | 'aprobada' | 'en_ejecucion' = 'borrador',
) {
  const cliente = await crearCliente();
  const contacto = await crearContacto(cliente.id);
  const ticket = await crearTicket({ cliente_id: cliente.id });
  const ot = await crearOt(ticket.id, { tipo: 'facturable', etapa, cliente_id: cliente.id });
  return { cliente, contacto, ticket, ot };
}

const hoy = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

// Las 5 líneas del diseño COT-0218: neto 475.000, IVA 90.250, total 565.250.
const LINEAS_DISENO = [
  {
    tipo: 'mano_de_obra',
    descripcion: 'Diagnóstico y revisión de logs del ERP',
    cantidad: 3,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
  },
  {
    tipo: 'mano_de_obra',
    descripcion: 'Carga de nuevo CAF y pruebas en QA',
    cantidad: 4,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
  },
  {
    tipo: 'mano_de_obra',
    descripcion: 'Paso a producción (horario extendido)',
    cantidad: 2,
    unidad: 'h',
    precio_unitario: 45000,
    descuento_pct: 0,
  },
  {
    tipo: 'mano_de_obra',
    descripcion: 'Capacitación breve al equipo',
    cantidad: 1,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
  },
  {
    tipo: 'servicio',
    descripcion: 'Soporte remoto post-implementación',
    cantidad: 1,
    unidad: 'un',
    precio_unitario: 90000,
    descuento_pct: 10,
  },
];

const entrada = (contacto_id: number | null, extra: Record<string, unknown> = {}) => ({
  contacto_id,
  fecha_emision: hoy(),
  validez_dias: 30,
  moneda: 'CLP',
  valor_uf: null,
  aplica_iva: true,
  condiciones: null,
  nota_interna: null,
  lineas: LINEAS_DISENO,
  ...extra,
});

describe('POST /api/ots/:id/cotizaciones (§5.2)', () => {
  it('crea la v1 en borrador con los valores por defecto y registra el evento', async () => {
    await fijarTarifas({
      iva_pct: 19,
      validez_dias_defecto: 15,
      condiciones_defecto: 'Pago a 30 días',
    });
    const { agente, usuario } = await como('tecnico');
    const { ot, ticket } = await otFacturable();
    const r = await agente.post(`/api/ots/${ot.id}/cotizaciones`);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      codigo: `COT-${ot.codigo.replace(/^\D+/, '')}`,
      version: 1,
      estado: 'borrador',
      moneda: 'CLP',
      aplica_iva: true,
      iva_pct: 19,
      validez_dias: 15,
      condiciones: 'Pago a 30 días',
      nota_interna: null,
      fecha_emision: hoy(),
      lineas: [],
      totales: { subtotal: 0, descuentos: 0, neto: 0, iva: 0, total: 0 },
      vigente: true,
      editable: true,
      duplicable: false,
      ot: { id: ot.id, etapa: 'borrador', ticket: { id: ticket.id, codigo: ticket.codigo } },
      creado_por: { id: usuario.id },
    });
    expect(r.body.versiones).toHaveLength(1);
    const evs = await dataSource.query(
      `SELECT accion, valor_nuevo, datos FROM evento WHERE entidad = 'ot' AND entidad_id = $1`,
      [String(ot.id)],
    );
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      accion: 'cotizacion_creada',
      valor_nuevo: `${r.body.codigo} v1`,
      datos: { cotizacion_id: r.body.id, version: 1 },
    });
    const det = await agente.get(`/api/ots/${ot.id}`);
    expect(det.body.cotizacion).toMatchObject({
      id: r.body.id,
      version: 1,
      estado: 'borrador',
      n_versiones: 1,
    });
  });

  it('hereda el contacto de la OT', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    await dataSource.query(`UPDATE ot SET contacto_id = $2 WHERE id = $1`, [ot.id, contacto.id]);
    const r = await agente.post(`/api/ots/${ot.id}/cotizaciones`);
    expect(r.body.contacto).toMatchObject({ id: contacto.id });
  });

  // Prueba 3
  it('OT interna o con cliente interno → 400; etapas posteriores → 409', async () => {
    const { agente } = await como();
    const t = await crearTicket();
    const interna = await crearOt(t.id, { tipo: 'interna' });
    const a = await agente.post(`/api/ots/${interna.id}/cotizaciones`);
    expect(a.status).toBe(400);
    expect(a.body.error.codigo).toBe('VALIDACION');

    const clienteInterno = await crearCliente({ es_interno: true });
    const conInterno = await crearOt(t.id, { tipo: 'facturable', cliente_id: clienteInterno.id });
    const b = await agente.post(`/api/ots/${conInterno.id}/cotizaciones`);
    expect(b.status).toBe(400);
    expect(b.body.error.detalles).toHaveProperty('cliente_id');

    const sinCliente = await crearOt(t.id, { tipo: 'facturable' });
    expect((await agente.post(`/api/ots/${sinCliente.id}/cotizaciones`)).status).toBe(400);

    const cliente = await crearCliente();
    for (const etapa of ['aprobada', 'en_ejecucion', 'cerrada', 'cancelada'] as const) {
      const ot = await crearOt(t.id, { tipo: 'facturable', etapa, cliente_id: cliente.id });
      const r = await agente.post(`/api/ots/${ot.id}/cotizaciones`);
      expect(r.status, etapa).toBe(409);
      expect(['TRANSICION_INVALIDA', 'OT_CERRADA']).toContain(r.body.error.codigo);
    }
    expect((await agente.post(`/api/ots/999999/cotizaciones`)).status).toBe(404);
  });

  // Prueba 4
  it('un solo borrador por OT: el segundo POST → 409 COTIZACION_NO_EDITABLE', async () => {
    const { agente } = await como();
    const { ot } = await otFacturable();
    expect((await agente.post(`/api/ots/${ot.id}/cotizaciones`)).status).toBe(201);
    const r = await agente.post(`/api/ots/${ot.id}/cotizaciones`);
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('COTIZACION_NO_EDITABLE');
  });

  it('con la vigente enviada → 409 NO_EDITABLE; aprobada → 409 COTIZACION_APROBADA; rechazada → 201 v2', async () => {
    const { agente } = await como();
    const a = await otFacturable('cotizada');
    await crearCotizacion(a.ot.id, { estado: 'enviada' });
    const ra = await agente.post(`/api/ots/${a.ot.id}/cotizaciones`);
    expect(ra.status).toBe(409);
    expect(ra.body.error.codigo).toBe('COTIZACION_NO_EDITABLE');

    const b = await otFacturable('cotizada');
    await crearCotizacion(b.ot.id, { estado: 'aprobada' });
    const rb = await agente.post(`/api/ots/${b.ot.id}/cotizaciones`);
    expect(rb.status).toBe(409);
    expect(rb.body.error.codigo).toBe('COTIZACION_APROBADA');

    const c = await otFacturable();
    await crearCotizacion(c.ot.id, { estado: 'rechazada' });
    const rc = await agente.post(`/api/ots/${c.ot.id}/cotizaciones`);
    expect(rc.status).toBe(201);
    expect(rc.body.version).toBe(2);
  });

  it('dos borradores por fábrica en la misma OT violan el índice único', async () => {
    const { ot } = await otFacturable();
    await crearCotizacion(ot.id, { estado: 'borrador' });
    await expect(crearCotizacion(ot.id, { estado: 'borrador' })).rejects.toThrow();
  });
});

describe('PUT /api/cotizaciones/:id (§5.3)', () => {
  // Prueba 6
  it('recalcula en el servidor y descarta lo que mande el cliente', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id, { estado: 'borrador' });
    const r = await agente.put(`/api/cotizaciones/${c.id}`).send({
      ...entrada(contacto.id),
      total: 1,
      neto: 1,
      iva_pct: 0,
      totales: { subtotal: 1, descuentos: 1, neto: 1, iva: 1, total: 1 },
    });
    expect(r.status).toBe(200);
    expect(r.body.iva_pct).toBe(19);
    expect(r.body.totales).toEqual({
      subtotal: 484000,
      descuentos: 9000,
      neto: 475000,
      iva: 90250,
      total: 565250,
    });
    expect(r.body.lineas.map((l: { total: number }) => l.total)).toEqual([
      114000, 152000, 90000, 38000, 81000,
    ]);
    expect(r.body.lineas.map((l: { orden: number }) => l.orden)).toEqual([1, 2, 3, 4, 5]);
    const [fila] = await dataSource.query(
      `SELECT neto::float8 AS neto, total::float8 AS total, iva_pct::float8 AS iva_pct FROM cotizacion WHERE id = $1`,
      [c.id],
    );
    expect(fila).toEqual({ neto: 475000, total: 565250, iva_pct: 19 });
  });

  it('el IVA desactivado deja total = neto; en CLP el valor_uf se conserva como manual (spec 8b)', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id);
    const r = await agente
      .put(`/api/cotizaciones/${c.id}`)
      .send(entrada(contacto.id, { aplica_iva: false, valor_uf: 38000 }));
    expect(r.status).toBe(200);
    expect(r.body.totales).toMatchObject({ iva: 0, total: 475000 });
    expect(r.body).toMatchObject({
      valor_uf: 38000,
      valor_uf_fecha: null,
      valor_uf_fuente: 'manual',
    });
  });

  it('UF con valor_uf: totales en UF y total_clp', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id);
    const r = await agente.put(`/api/cotizaciones/${c.id}`).send(
      entrada(contacto.id, {
        moneda: 'UF',
        valor_uf: 38000.5,
        lineas: [
          {
            tipo: 'servicio',
            descripcion: 'Proyecto',
            cantidad: 2.5,
            unidad: 'un',
            precio_unitario: 1.33,
            descuento_pct: 0,
          },
        ],
      }),
    );
    expect(r.status).toBe(200);
    expect(r.body.totales).toMatchObject({ neto: 3.33, iva: 0.63, total: 3.96 });
    expect(r.body.total_clp).toBe(Math.round(3.96 * 38000.5));
    expect(r.body.neto_clp).toBe(Math.round(3.33 * 38000.5));
  });

  it('entradas inválidas → 400 por campo', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id);
    const linea = LINEAS_DISENO[0]!;
    const invalida = async (extra: Record<string, unknown>) =>
      agente.put(`/api/cotizaciones/${c.id}`).send(entrada(contacto.id, extra));
    for (const malo of [
      { cantidad: 0 },
      { precio_unitario: -1 },
      { descuento_pct: 101 },
      { cantidad: 1.001 },
      { descripcion: '' },
    ]) {
      const r = await invalida({ lineas: [{ ...linea, ...malo }] });
      expect(r.status, JSON.stringify(malo)).toBe(400);
      expect(r.body.error.codigo).toBe('VALIDACION');
      expect(Object.keys(r.body.error.detalles).join()).toContain('lineas');
    }
    const muchas = await invalida({ lineas: Array.from({ length: 101 }, () => linea) });
    expect(muchas.status).toBe(400);
    const uf = await invalida({ moneda: 'UF', valor_uf: null });
    expect(uf.status).toBe(400);
    expect(uf.body.error.detalles).toHaveProperty('valor_uf');
    // nada cambió
    const [fila] = await dataSource.query(
      `SELECT neto::float8 AS neto FROM cotizacion WHERE id = $1`,
      [c.id],
    );
    expect(fila.neto).toBe(0);
  });

  it('cambiar el IVA de la configuración no altera cotizaciones existentes; una nueva nace con el nuevo', async () => {
    const { agente } = await como();
    const a = await otFacturable();
    const b = await otFacturable();
    const existente = (await agente.post(`/api/ots/${a.ot.id}/cotizaciones`)).body;
    await agente.put(`/api/cotizaciones/${existente.id}`).send(entrada(a.contacto.id));
    await fijarTarifas({ iva_pct: 0 });
    const guardada = await agente
      .put(`/api/cotizaciones/${existente.id}`)
      .send(entrada(a.contacto.id));
    expect(guardada.body.iva_pct).toBe(19);
    expect(guardada.body.totales.total).toBe(565250);
    const nueva = await agente.post(`/api/ots/${b.ot.id}/cotizaciones`);
    expect(nueva.body.iva_pct).toBe(0);
  });

  it('texto con HTML se guarda y devuelve literal', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id);
    const html = '<img src=x onerror=alert(1)>';
    const r = await agente.put(`/api/cotizaciones/${c.id}`).send(
      entrada(contacto.id, {
        condiciones: '<b>Pago</b> <script>x</script>',
        lineas: [
          {
            tipo: 'servicio',
            descripcion: html,
            cantidad: 1,
            unidad: 'un',
            precio_unitario: 1000,
            descuento_pct: 0,
          },
        ],
      }),
    );
    expect(r.status).toBe(200);
    expect(r.body.lineas[0].descripcion).toBe(html);
    expect(r.body.condiciones).toBe('<b>Pago</b> <script>x</script>');
  });

  // Prueba 5 (editar)
  it('una enviada, una no vigente y una aprobada no se editan; las filas no cambian', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable('cotizada');
    const v1 = await crearCotizacion(ot.id, {
      estado: 'enviada',
      lineas: [{ cantidad: 1, precio_unitario: 1000 }],
    });
    const antes = await dataSource.query(
      `SELECT actualizado_en, neto::float8 AS neto FROM cotizacion WHERE id = $1`,
      [v1.id],
    );
    const r = await agente.put(`/api/cotizaciones/${v1.id}`).send(entrada(contacto.id));
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('COTIZACION_NO_EDITABLE');
    const despues = await dataSource.query(
      `SELECT actualizado_en, neto::float8 AS neto FROM cotizacion WHERE id = $1`,
      [v1.id],
    );
    expect(despues).toEqual(antes);

    await crearCotizacion(ot.id, { estado: 'borrador' }); // v2: v1 deja de ser vigente
    const r2 = await agente.put(`/api/cotizaciones/${v1.id}`).send(entrada(contacto.id));
    expect(r2.status).toBe(409);

    const aprobada = await otFacturable('aprobada');
    const va = await crearCotizacion(aprobada.ot.id, { estado: 'aprobada' });
    const r3 = await agente.put(`/api/cotizaciones/${va.id}`).send(entrada(aprobada.contacto.id));
    expect(r3.status).toBe(409);
    expect(['COTIZACION_APROBADA', 'COTIZACION_NO_EDITABLE']).toContain(r3.body.error.codigo);
    expect((await agente.put(`/api/cotizaciones/999999`).send(entrada(null))).status).toBe(404);
  });

  it('OT cancelada → 409 OT_CERRADA', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable('cotizada');
    const c = await crearCotizacion(ot.id, { estado: 'borrador' });
    await dataSource.query(
      `UPDATE ot SET etapa = 'cancelada', cancelada_en = now(), motivo_cancelacion = 'x', estado_facturacion = 'no_aplica' WHERE id = $1`,
      [ot.id],
    );
    const r = await agente.put(`/api/cotizaciones/${c.id}`).send(entrada(contacto.id));
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('OT_CERRADA');
  });

  // Prueba 7 (contacto)
  it('contacto de otro cliente o inactivo → 400', async () => {
    const { agente } = await como();
    const { ot, cliente } = await otFacturable();
    const c = await crearCotizacion(ot.id);
    const ajeno = await crearContacto((await crearCliente()).id);
    const a = await agente.put(`/api/cotizaciones/${c.id}`).send(entrada(ajeno.id));
    expect(a.status).toBe(400);
    expect(a.body.error.detalles).toHaveProperty('contacto_id');
    const inactivo = await crearContacto(cliente.id);
    await dataSource.query(`UPDATE contacto SET activo = false WHERE id = $1`, [inactivo.id]);
    expect((await agente.put(`/api/cotizaciones/${c.id}`).send(entrada(inactivo.id))).status).toBe(
      400,
    );
  });

  it('registra un evento de cambio por campo con cotizacion_id y version', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id);
    await agente
      .put(`/api/cotizaciones/${c.id}`)
      .send(entrada(contacto.id, { nota_interna: 'Ojo con el cliente' }));
    const evs = await dataSource.query(
      `SELECT campo, valor_anterior, valor_nuevo, datos FROM evento
        WHERE entidad = 'ot' AND entidad_id = $1 AND accion = 'cambio' ORDER BY id`,
      [String(ot.id)],
    );
    const campos = evs.map((e: { campo: string }) => e.campo);
    expect(campos).toEqual(
      expect.arrayContaining(['contacto', 'lineas', 'neto', 'total', 'nota_interna']),
    );
    for (const e of evs) expect(e.datos).toEqual({ cotizacion_id: c.id, version: 1 });
    const lineas = evs.find((e: { campo: string }) => e.campo === 'lineas');
    expect(lineas).toMatchObject({ valor_anterior: '0 líneas', valor_nuevo: '5 líneas' });
    const total = evs.find((e: { campo: string }) => e.campo === 'total');
    expect(total).toMatchObject({ valor_anterior: '$0', valor_nuevo: '$565.250' });
    // guardar lo mismo no registra nada
    const n = evs.length;
    await agente
      .put(`/api/cotizaciones/${c.id}`)
      .send(entrada(contacto.id, { nota_interna: 'Ojo con el cliente' }));
    const otros = await dataSource.query(
      `SELECT 1 FROM evento WHERE entidad = 'ot' AND entidad_id = $1 AND accion = 'cambio'`,
      [String(ot.id)],
    );
    expect(otros).toHaveLength(n);
  });
});

describe('GET /api/cotizaciones/:id y OT (§5.4, §6.1)', () => {
  it('devuelve vence_el, versiones, vigente, editable y duplicable', async () => {
    const { agente } = await como('lectura');
    const { ot } = await otFacturable('cotizada');
    const v1 = await crearCotizacion(ot.id, {
      estado: 'enviada',
      fecha_emision: '2026-09-29',
      lineas: [{ cantidad: 1, precio_unitario: 1000 }],
    });
    const r = await agente.get(`/api/cotizaciones/${v1.id}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      vence_el: '2026-10-29',
      vigente: true,
      editable: false,
      duplicable: true,
      versiones: [{ id: v1.id, version: 1, estado: 'enviada', total: 1190 }],
    });
    const v2 = await crearCotizacion(ot.id, { estado: 'borrador' });
    const r1 = await agente.get(`/api/cotizaciones/${v1.id}`);
    expect(r1.body).toMatchObject({ vigente: false, duplicable: false });
    expect(r1.body.versiones.map((v: { version: number }) => v.version)).toEqual([1, 2]);
    expect((await agente.get(`/api/cotizaciones/${v2.id}`)).body.editable).toBe(true);
    expect((await agente.get(`/api/cotizaciones/999999`)).status).toBe(404);
  });

  it('OtSalida: cotizacion vigente, neto en CLP (UF convertida), puede_cotizar', async () => {
    const { agente } = await como();
    const a = await otFacturable();
    expect((await agente.get(`/api/ots/${a.ot.id}`)).body).toMatchObject({
      cotizacion: null,
      neto: null,
      puede_cotizar: true,
    });
    await crearCotizacion(a.ot.id, {
      estado: 'enviada',
      moneda: 'UF',
      valor_uf: 38000.5,
      lineas: [{ cantidad: 2, precio_unitario: 10 }],
    });
    const det = await agente.get(`/api/ots/${a.ot.id}`);
    expect(det.body.neto).toBe(760010);
    expect(det.body.cotizacion).toMatchObject({
      version: 1,
      estado: 'enviada',
      moneda: 'UF',
      neto: 20,
      neto_clp: 760010,
      n_versiones: 1,
    });

    const interna = await crearOt((await crearTicket()).id, { tipo: 'interna' });
    expect((await agente.get(`/api/ots/${interna.id}`)).body.puede_cotizar).toBe(false);
    const aprobada = await otFacturable('aprobada');
    expect((await agente.get(`/api/ots/${aprobada.ot.id}`)).body.puede_cotizar).toBe(false);
  });

  it('costo_interno: solo OT internas con tarifa configurada (horas registradas × tarifa)', async () => {
    const { agente, usuario } = await como();
    const t = await crearTicket();
    const interna = await crearOt(t.id, { tipo: 'interna' });
    await dataSource.query(
      `INSERT INTO registro_horas (ot_id, usuario_id, fecha, horas) VALUES ($1, $2, $3, 12)`,
      [interna.id, usuario.id, hoy()],
    );
    expect((await agente.get(`/api/ots/${interna.id}`)).body.costo_interno).toBeNull();
    await fijarTarifas({ costo_interno: 18000 });
    expect((await agente.get(`/api/ots/${interna.id}`)).body.costo_interno).toEqual({
      horas: 12,
      tarifa: 18000,
      monto: 216000,
    });
    const facturable = await crearOt(t.id, { tipo: 'facturable' });
    expect((await agente.get(`/api/ots/${facturable.id}`)).body.costo_interno).toBeNull();
  });

  it('el neto del cierre sale de la cotización vigente ("($1.240.000 neto)")', async () => {
    const { ot } = await otFacturable('en_ejecucion');
    await crearCotizacion(ot.id, {
      estado: 'aprobada',
      lineas: [{ cantidad: 1, precio_unitario: 1240000 }],
    });
    const neto = await netoVigenteClp(dataSource.manager, ot.id);
    expect(neto).toBe(1240000);
    const efectos = efectosCierreOt(
      {
        ot: { codigo: ot.codigo, tipo: 'facturable', neto },
        ticket: { codigo: 'TK-1', estado: 'en_curso', responsables: [], seguidores: [] },
        responsable_siguiente: null,
      },
      { resolvio_ticket: true, resumen: 'Listo' },
    );
    expect(efectos.ot).toContain('($1.240.000 neto)');
  });
});

// Prueba 15
describe('GET /api/cotizaciones (§5.4)', () => {
  it('filtra por estado, solo_vigentes, q, cliente_id y ot_id', async () => {
    const { agente } = await como('lectura');
    const a = await otFacturable('cotizada');
    const b = await otFacturable();
    const a1 = await crearCotizacion(a.ot.id, { estado: 'reemplazada' });
    const a2 = await crearCotizacion(a.ot.id, {
      estado: 'enviada',
      lineas: [{ cantidad: 1, precio_unitario: 475000 }],
    });
    const b1 = await crearCotizacion(b.ot.id, { estado: 'borrador' });

    const ids = (r: { body: { datos: { id: number }[] } }) => r.body.datos.map((d) => d.id).sort();
    const todas = await agente.get('/api/cotizaciones');
    expect(todas.status).toBe(200);
    expect(todas.body.total).toBe(3);
    expect(ids(await agente.get('/api/cotizaciones?estado=enviada'))).toEqual([a2.id]);
    expect(ids(await agente.get('/api/cotizaciones?estado=enviada,borrador'))).toEqual(
      [a2.id, b1.id].sort(),
    );
    expect(ids(await agente.get('/api/cotizaciones?solo_vigentes=true'))).toEqual(
      [a2.id, b1.id].sort(),
    );
    expect(ids(await agente.get(`/api/cotizaciones?ot_id=${a.ot.id}`))).toEqual(
      [a1.id, a2.id].sort(),
    );
    expect(ids(await agente.get(`/api/cotizaciones?cliente_id=${b.cliente.id}`))).toEqual([b1.id]);
    const numero = a.ot.codigo.replace(/^\D+/, '');
    expect(ids(await agente.get(`/api/cotizaciones?q=${numero}`))).toEqual([a1.id, a2.id].sort());
    expect(ids(await agente.get(`/api/cotizaciones?q=COT-${numero}`))).toEqual(
      [a1.id, a2.id].sort(),
    );
    expect(
      ids(await agente.get(`/api/cotizaciones?q=${encodeURIComponent(b.cliente.nombre)}`)),
    ).toEqual([b1.id]);

    const fila = (await agente.get(`/api/cotizaciones?ot_id=${a.ot.id}&solo_vigentes=true`)).body
      .datos[0];
    expect(fila).toMatchObject({
      id: a2.id,
      version: 2,
      estado: 'enviada',
      neto: 475000,
      total: 565250,
      neto_clp: 475000,
      vigente: true,
      ot: { id: a.ot.id, etapa: 'cotizada' },
      cliente: { id: a.cliente.id },
    });
  });

  it('GET /api/ots muestra el neto de la vigente (UF convertida) y null sin cotización', async () => {
    const { agente } = await como('lectura');
    const a = await otFacturable('cotizada');
    const b = await otFacturable();
    const c = await otFacturable('cotizada');
    await crearCotizacion(a.ot.id, {
      estado: 'reemplazada',
      lineas: [{ cantidad: 1, precio_unitario: 1 }],
    });
    await crearCotizacion(a.ot.id, {
      estado: 'enviada',
      lineas: [{ cantidad: 1, precio_unitario: 475000 }],
    });
    await crearCotizacion(c.ot.id, {
      estado: 'enviada',
      moneda: 'UF',
      valor_uf: 40000,
      lineas: [{ cantidad: 1, precio_unitario: 12.5 }],
    });
    const r = await agente.get('/api/ots');
    const neto = (id: number) => r.body.datos.find((o: { id: number }) => o.id === id).neto;
    expect(neto(a.ot.id)).toBe(475000);
    expect(neto(c.ot.id)).toBe(500000);
    expect(neto(b.ot.id)).toBeNull();
  });
});

// Prueba 21
describe('numeración del código (§18.11)', () => {
  it('codigo = COT- + número de la OT; cambiar el prefijo de OT no altera cotizaciones existentes', async () => {
    const { agente } = await como('admin');
    const cliente = await crearCliente();
    const ticket = await crearTicket({ estado: 'en_curso', cliente_id: cliente.id });
    const o1 = await agente
      .post(`/api/tickets/${ticket.id}/convertir-en-ot`)
      .send({ tipo: 'facturable' });
    expect(o1.body.codigo).toBe('OT-0200');
    const c1 = await agente.post(`/api/ots/${o1.body.id}/cotizaciones`);
    expect(c1.body.codigo).toBe('COT-0200');

    const num = (ot: Record<string, unknown>) => ({
      ticket: { prefijo: 'TK-', inicial: 1000, digitos: 4, modo: 'correlativo' },
      ot,
    });
    const cambio = await agente
      .put('/api/config/numeracion')
      .send(num({ prefijo: 'OT-', inicial: 201, digitos: 6 }));
    expect(cambio.status).toBe(200);
    const o2 = await agente
      .post(`/api/tickets/${ticket.id}/convertir-en-ot`)
      .send({ tipo: 'facturable' });
    expect(o2.body.codigo).toBe('OT-000201');
    expect((await agente.post(`/api/ots/${o2.body.id}/cotizaciones`)).body.codigo).toBe(
      'COT-000201',
    );

    await agente
      .put('/api/config/numeracion')
      .send(num({ prefijo: 'OTX-', inicial: 300, digitos: 6 }));
    const o3 = await agente
      .post(`/api/tickets/${ticket.id}/convertir-en-ot`)
      .send({ tipo: 'facturable' });
    expect(o3.body.codigo).toBe('OTX-000300');
    expect((await agente.post(`/api/ots/${o3.body.id}/cotizaciones`)).body.codigo).toBe(
      'COT-000300',
    );
    const [c1b] = await dataSource.query(`SELECT codigo FROM cotizacion WHERE id = $1`, [
      c1.body.id,
    ]);
    expect(c1b.codigo).toBe('COT-0200');
  });
});
