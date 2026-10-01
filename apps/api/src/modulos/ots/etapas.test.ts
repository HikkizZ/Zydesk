import { describe, expect, it } from 'vitest';
import {
  crearArchivoPendiente,
  crearCliente,
  crearContacto,
  crearOt,
  crearTarea,
  crearTicket,
  crearUsuario,
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

const eventos = (entidad: 'ot' | 'ticket', id: number) =>
  dataSource.query(
    `SELECT accion, campo, valor_anterior, valor_nuevo, datos, autor_id FROM evento
      WHERE entidad = $1 AND entidad_id = $2 ORDER BY id`,
    [entidad, String(id)],
  );

const fila = async (id: number) =>
  (await dataSource.query(`SELECT * FROM ot WHERE id = $1`, [id]))[0];

const hoy = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

// OT facturable de un cliente externo, lista para cotizar.
async function otFacturable(
  etapa: 'borrador' | 'cotizada' | 'aprobada' | 'en_ejecucion' = 'borrador',
) {
  const cliente = await crearCliente();
  const ticket = await crearTicket({ cliente_id: cliente.id });
  const ot = await crearOt(ticket.id, { tipo: 'facturable', etapa, cliente_id: cliente.id });
  return { cliente, ticket, ot };
}

describe('cambiar-etapa (§4.5)', () => {
  it('borrador → cotizada → borrador → cotizada deja un evento de etapa por cambio', async () => {
    const { agente } = await como('tecnico');
    const { ot } = await otFacturable();
    const a = await agente.post(`/api/ots/${ot.id}/cambiar-etapa`).send({ etapa: 'cotizada' });
    expect(a.status).toBe(200);
    expect(a.body.etapa).toBe('cotizada');
    const evs = await eventos('ot', ot.id);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      accion: 'cambio',
      campo: 'etapa',
      valor_anterior: 'Borrador',
      valor_nuevo: 'Cotizada',
      datos: null,
    });
    const b = await agente.post(`/api/ots/${ot.id}/cambiar-etapa`).send({ etapa: 'borrador' });
    expect(b.status).toBe(200);
    expect(b.body.tipo_cambiable).toBe(true);
    expect(
      (await agente.post(`/api/ots/${ot.id}/cambiar-etapa`).send({ etapa: 'cotizada' })).status,
    ).toBe(200);
    expect(await eventos('ot', ot.id)).toHaveLength(3);
  });

  it('cotizada exige un cliente externo (400 VALIDACION cliente_id)', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const sin = await crearOt(t.id, { tipo: 'facturable' });
    const r = await agente.post(`/api/ots/${sin.id}/cambiar-etapa`).send({ etapa: 'cotizada' });
    expect(r.status).toBe(400);
    expect(r.body.error.detalles).toHaveProperty('cliente_id');
    const interno = await crearCliente({ es_interno: true });
    const otInterno = await crearOt(t.id, { tipo: 'facturable', cliente_id: interno.id });
    expect(
      (await agente.post(`/api/ots/${otInterno.id}/cambiar-etapa`).send({ etapa: 'cotizada' }))
        .status,
    ).toBe(400);
    expect((await fila(sin.id)).etapa).toBe('borrador');
  });

  it('prueba 3: transiciones inválidas → 409 TRANSICION_INVALIDA; etapas con permiso propio → 400', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const interna = await crearOt(t.id, { tipo: 'interna' });
    const r = await agente.post(`/api/ots/${interna.id}/cambiar-etapa`).send({ etapa: 'cotizada' });
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TRANSICION_INVALIDA');
    expect(r.body.error.detalles).toEqual({
      entidad: 'ot',
      desde: 'borrador',
      hasta: 'cotizada',
      permitidas: ['aprobada', 'cancelada'],
    });
    const cerrada = await crearOt(t.id, { etapa: 'cerrada' });
    expect(
      (await agente.post(`/api/ots/${cerrada.id}/cambiar-etapa`).send({ etapa: 'borrador' }))
        .status,
    ).toBe(409);
    const borrador = await crearOt(t.id);
    expect(
      (await agente.post(`/api/ots/${borrador.id}/cambiar-etapa`).send({ etapa: 'en_ejecucion' }))
        .status,
    ).toBe(409);
    for (const etapa of ['aprobada', 'cerrada', 'cancelada']) {
      expect(
        (await agente.post(`/api/ots/${borrador.id}/cambiar-etapa`).send({ etapa })).status,
      ).toBe(400);
    }
    expect(
      (await agente.post('/api/ots/999999/cambiar-etapa').send({ etapa: 'borrador' })).status,
    ).toBe(404);
  });

  it('en_ejecucion fija inicio = hoy solo si faltaba', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const a = await crearOt(t.id, { etapa: 'aprobada' });
    const b = await crearOt(t.id, { etapa: 'aprobada' });
    await dataSource.query(`UPDATE ot SET inicio = '2026-01-15' WHERE id = $1`, [b.id]);
    const ra = await agente.post(`/api/ots/${a.id}/cambiar-etapa`).send({ etapa: 'en_ejecucion' });
    const rb = await agente.post(`/api/ots/${b.id}/cambiar-etapa`).send({ etapa: 'en_ejecucion' });
    expect(ra.body).toMatchObject({ etapa: 'en_ejecucion', inicio: hoy() });
    expect(rb.body).toMatchObject({ etapa: 'en_ejecucion', inicio: '2026-01-15' });
  });
});

describe('aprobación interna (§4.6)', () => {
  it('prueba 10: coordinación distinta del aprobador aprueba; aprobada_por = actor', async () => {
    const { agente, usuario } = await como('coordinacion');
    const otroAprobador = await crearUsuario({ rol: 'admin' });
    const t = await crearTicket();
    const ot = await crearOt(t.id, { tipo: 'interna', aprobador_id: otroAprobador.id });
    const r = await agente.post(`/api/ots/${ot.id}/aprobar`).send({});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      etapa: 'aprobada',
      aprobada_por: { id: usuario.id, nombre: usuario.nombre },
    });
    expect(r.body.aprobada_en).not.toBeNull();
    const evs = await eventos('ot', ot.id);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      campo: 'etapa',
      valor_anterior: 'Borrador',
      valor_nuevo: 'Aprobada',
      datos: { aprobada_por: usuario.nombre },
    });
  });

  it('iniciar sigue a en_ejecucion en la misma transacción con dos eventos', async () => {
    const { agente } = await como('admin');
    const t = await crearTicket();
    const ot = await crearOt(t.id, { tipo: 'interna' });
    const r = await agente.post(`/api/ots/${ot.id}/aprobar`).send({ iniciar: true });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ etapa: 'en_ejecucion', inicio: hoy() });
    const evs = await eventos('ot', ot.id);
    expect(evs.map((e: { valor_nuevo: string }) => e.valor_nuevo)).toEqual([
      'Aprobada',
      'En ejecución',
    ]);
    expect(evs[1].valor_anterior).toBe('Aprobada');
  });

  it('prueba 3: facturable → 409 con su mensaje; fuera de borrador → 409; técnico y lectura → 403', async () => {
    const { agente } = await como('coordinacion');
    const t = await crearTicket();
    const fact = await crearOt(t.id, { tipo: 'facturable' });
    const r = await agente.post(`/api/ots/${fact.id}/aprobar`).send({});
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TRANSICION_INVALIDA');
    expect(r.body.error.mensaje).toBe('Una OT facturable se aprueba con la aprobación del cliente');
    const aprobada = await crearOt(t.id, { tipo: 'interna', etapa: 'aprobada' });
    expect((await agente.post(`/api/ots/${aprobada.id}/aprobar`).send({})).status).toBe(409);
    expect((await agente.post('/api/ots/999999/aprobar').send({})).status).toBe(404);
    const interna = await crearOt(t.id, { tipo: 'interna' });
    for (const rol of ['tecnico', 'lectura'] as const) {
      const otro = await como(rol);
      expect((await otro.agente.post(`/api/ots/${interna.id}/aprobar`).send({})).status).toBe(403);
    }
    expect((await fila(interna.id)).etapa).toBe('borrador');
  });
});

describe('aprobación del cliente (prueba 9)', () => {
  it('registra la aprobación con respaldo: etapa aprobada, archivo en la galería de la OT', async () => {
    const { agente, usuario } = await como('coordinacion');
    const { cliente, ot } = await otFacturable('cotizada');
    const contacto = await crearContacto(cliente.id, { nombre: 'Marta Lillo' });
    const respaldo = await crearArchivoPendiente(usuario.id, {
      tipo_mime: 'application/pdf',
      nombre: 'oc.pdf',
    });
    const r = await agente.put(`/api/ots/${ot.id}/aprobacion`).send({
      contacto_id: contacto.id,
      fecha: '2026-09-28',
      forma: 'orden_de_compra',
      archivo_id: respaldo.id,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      etapa: 'aprobada',
      aprobada_por: { id: usuario.id },
      contacto: { id: contacto.id, nombre: 'Marta Lillo' },
      aprobacion: {
        contacto: { id: contacto.id, nombre: 'Marta Lillo' },
        fecha: '2026-09-28',
        forma: 'orden_de_compra',
        archivo: { id: respaldo.id, nombre_original: 'oc.pdf' },
        registrada_por: { id: usuario.id },
      },
    });
    expect(r.body.archivos.map((a: { id: number }) => a.id)).toContain(respaldo.id);
    const [archivo] = await dataSource.query(
      `SELECT entidad, entidad_id FROM archivo WHERE id = $1`,
      [respaldo.id],
    );
    expect(archivo).toEqual({ entidad: 'ot', entidad_id: ot.id });
    const evs = await eventos('ot', ot.id);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      campo: 'etapa',
      valor_anterior: 'Cotizada',
      valor_nuevo: 'Aprobada por cliente',
      datos: {
        contacto: 'Marta Lillo',
        fecha: '2026-09-28',
        forma: 'orden_de_compra',
        archivo_id: respaldo.id,
      },
    });
  });

  it('iniciar: true → en_ejecucion con dos eventos; una segunda aprobación → 409', async () => {
    const { agente, usuario } = await como('admin');
    const { cliente, ot } = await otFacturable('cotizada');
    const contacto = await crearContacto(cliente.id, { aprueba_cotizaciones: true });
    const cuerpo = async () => ({
      contacto_id: contacto.id,
      fecha: '2026-09-28',
      forma: 'correo',
      archivo_id: (await crearArchivoPendiente(usuario.id)).id,
    });
    const r = await agente
      .put(`/api/ots/${ot.id}/aprobacion`)
      .send({ ...(await cuerpo()), iniciar: true });
    expect(r.status).toBe(200);
    expect(r.body.etapa).toBe('en_ejecucion');
    expect((await eventos('ot', ot.id)).map((e: { valor_nuevo: string }) => e.valor_nuevo)).toEqual(
      ['Aprobada por cliente', 'En ejecución'],
    );
    const otra = await agente.put(`/api/ots/${ot.id}/aprobacion`).send(await cuerpo());
    expect(otra.status).toBe(409);
    expect(otra.body.error.codigo).toBe('TRANSICION_INVALIDA');
  });

  it('validaciones: sin respaldo, respaldo ajeno, contacto de otro cliente o inactivo → 400', async () => {
    const { agente, usuario } = await como('coordinacion');
    const otro = await crearUsuario();
    const { cliente, ot } = await otFacturable('cotizada');
    const contacto = await crearContacto(cliente.id);
    const ajeno = await crearContacto((await crearCliente()).id);
    const base = { contacto_id: contacto.id, fecha: '2026-09-28', forma: 'correo' };
    const put = (b: object) => agente.put(`/api/ots/${ot.id}/aprobacion`).send(b);

    expect((await put(base)).status).toBe(400); // sin archivo_id
    const deOtro = await crearArchivoPendiente(otro.id);
    const r1 = await put({ ...base, archivo_id: deOtro.id });
    expect(r1.status).toBe(400);
    expect(r1.body.error.detalles).toHaveProperty('archivo_ids');
    const propio = await crearArchivoPendiente(usuario.id);
    const r2 = await put({ ...base, contacto_id: ajeno.id, archivo_id: propio.id });
    expect(r2.status).toBe(400);
    expect(r2.body.error.detalles).toHaveProperty('contacto_id');
    await dataSource.query(`UPDATE contacto SET activo = false WHERE id = $1`, [contacto.id]);
    expect((await put({ ...base, archivo_id: propio.id })).status).toBe(400);
    expect((await put({ ...base, forma: 'verbal', archivo_id: propio.id })).status).toBe(400);

    // nada se escribió
    expect((await fila(ot.id)).etapa).toBe('cotizada');
    expect(await dataSource.query(`SELECT 1 FROM aprobacion_cliente`)).toHaveLength(0);
    expect(
      (await dataSource.query(`SELECT entidad FROM archivo WHERE id = $1`, [propio.id]))[0].entidad,
    ).toBeNull();
    expect(await eventos('ot', ot.id)).toHaveLength(0);
  });

  it('prueba 3: en borrador o en una interna → 409; técnico → 403', async () => {
    const { agente, usuario } = await como('coordinacion');
    const { cliente, ot } = await otFacturable('borrador');
    const contacto = await crearContacto(cliente.id);
    const cuerpo = async (id: number = usuario.id) => ({
      contacto_id: contacto.id,
      fecha: '2026-09-28',
      forma: 'correo',
      archivo_id: (await crearArchivoPendiente(id)).id,
    });
    const r = await agente.put(`/api/ots/${ot.id}/aprobacion`).send(await cuerpo());
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TRANSICION_INVALIDA');
    const interna = await crearOt((await crearTicket()).id, { tipo: 'interna' });
    expect(
      (await agente.put(`/api/ots/${interna.id}/aprobacion`).send(await cuerpo())).status,
    ).toBe(409);
    const tec = await como('tecnico');
    await dataSource.query(`UPDATE ot SET etapa = 'cotizada' WHERE id = $1`, [ot.id]);
    expect(
      (await tec.agente.put(`/api/ots/${ot.id}/aprobacion`).send(await cuerpo(tec.usuario.id)))
        .status,
    ).toBe(403);
  });
});

describe('cancelar (prueba 8)', () => {
  it.each(['borrador', 'cotizada', 'en_ejecucion'] as const)(
    'desde %s → 200, no_aplica, tareas en la OT y evento en el ticket',
    async (etapa) => {
      const { agente, usuario } = await como('coordinacion');
      const { ticket, ot } = await otFacturable(etapa);
      const tarea = await crearTarea({ ot_id: ot.id }, { titulo: 'Pendiente' });
      const antesTicket = (await eventos('ticket', ticket.id)).length;
      const r = await agente
        .post(`/api/ots/${ot.id}/cancelar`)
        .send({ motivo: 'El cliente desistió' });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({
        etapa: 'cancelada',
        estado_facturacion: 'no_aplica',
        motivo_cancelacion: 'El cliente desistió',
      });
      expect(r.body.cancelada_en).not.toBeNull();
      expect(r.body.tareas.map((t: { id: number }) => t.id)).toEqual([tarea.id]);
      const [t] = await dataSource.query(`SELECT ot_id, ticket_id FROM tarea WHERE id = $1`, [
        tarea.id,
      ]);
      expect(t).toEqual({ ot_id: ot.id, ticket_id: null });

      const evOt = (await eventos('ot', ot.id)).at(-1);
      expect(evOt).toMatchObject({
        campo: 'etapa',
        valor_nuevo: 'Cancelada',
        datos: { motivo: 'El cliente desistió' },
        autor_id: usuario.id,
      });
      const evTicket = (await eventos('ticket', ticket.id)).slice(antesTicket);
      expect(evTicket).toHaveLength(1);
      expect(evTicket[0]).toMatchObject({
        accion: 'ot_cancelada',
        datos: { ot_id: ot.id, codigo: ot.codigo, motivo: 'El cliente desistió' },
      });
    },
  );

  it('cerrada o cancelada → 409; sin motivo → 400; técnico y lectura → 403; 404', async () => {
    const { agente } = await como('admin');
    const t = await crearTicket();
    for (const etapa of ['cerrada', 'cancelada'] as const) {
      const ot = await crearOt(t.id, { etapa });
      const r = await agente.post(`/api/ots/${ot.id}/cancelar`).send({ motivo: 'x' });
      expect(r.status).toBe(409);
      expect(r.body.error.codigo).toBe('TRANSICION_INVALIDA');
    }
    const ot = await crearOt(t.id);
    expect((await agente.post(`/api/ots/${ot.id}/cancelar`).send({})).status).toBe(400);
    expect((await agente.post(`/api/ots/${ot.id}/cancelar`).send({ motivo: '  ' })).status).toBe(
      400,
    );
    for (const rol of ['tecnico', 'lectura'] as const) {
      const otro = await como(rol);
      expect(
        (await otro.agente.post(`/api/ots/${ot.id}/cancelar`).send({ motivo: 'x' })).status,
      ).toBe(403);
    }
    expect((await fila(ot.id)).etapa).toBe('borrador');
    expect((await agente.post('/api/ots/999999/cancelar').send({ motivo: 'x' })).status).toBe(404);
  });

  it('una OT cancelada deja de bloquear el cierre del ticket y publica ot.cancelada tras el commit', async () => {
    const { agente } = await como('coordinacion');
    const responsable = await crearUsuario();
    const seguidor = await crearUsuario();
    const ticket = await crearTicket({ estado: 'en_curso', principal_id: responsable.id });
    await dataSource.query(`INSERT INTO ticket_seguidor (ticket_id, usuario_id) VALUES ($1, $2)`, [
      ticket.id,
      seguidor.id,
    ]);
    const ot = await crearOt(ticket.id, { etapa: 'en_ejecucion' });
    const recibidos: { ot_id: number; ticket_id: number; destinatarios_ids: number[] }[] = [];
    const oyente = (d: (typeof recibidos)[number]): void => void recibidos.push(d);
    eventosDominio.on('ot.cancelada', oyente);
    try {
      expect((await agente.post(`/api/ots/${ot.id}/cancelar`).send({ motivo: 'x' })).status).toBe(
        200,
      );
      // falla → no se publica
      expect((await agente.post(`/api/ots/${ot.id}/cancelar`).send({ motivo: 'x' })).status).toBe(
        409,
      );
    } finally {
      eventosDominio.off('ot.cancelada', oyente);
    }
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0]).toMatchObject({ ot_id: ot.id, ticket_id: ticket.id });
    expect(recibidos[0]!.destinatarios_ids.sort((a, b) => a - b)).toEqual(
      [responsable.id, seguidor.id].sort((a, b) => a - b),
    );
    const r = await agente
      .post(`/api/tickets/${ticket.id}/cambiar-estado`)
      .send({ estado: 'resuelto' });
    expect(r.status).toBe(200);
  });
});

describe('facturar', () => {
  it('por_facturar → facturada con n_factura y evento de facturación', async () => {
    const { agente, usuario } = await como('coordinacion');
    const { ot } = await otFacturable();
    await dataSource.query(
      `UPDATE ot SET etapa = 'cerrada', estado_facturacion = 'por_facturar',
      resumen_cierre = 'ok', resolvio_ticket = true, cerrada_en = now() WHERE id = $1`,
      [ot.id],
    );
    const r = await agente.post(`/api/ots/${ot.id}/facturar`).send({ n_factura: 'F-1001' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      estado_facturacion: 'facturada',
      n_factura: 'F-1001',
      facturada_por: { id: usuario.id },
      etapa: 'cerrada',
    });
    expect(r.body.facturada_en).not.toBeNull();
    const [ev] = await eventos('ot', ot.id);
    expect(ev).toMatchObject({
      accion: 'cambio',
      campo: 'estado_facturacion',
      valor_anterior: 'Por facturar',
      valor_nuevo: 'Facturada',
      datos: { n_factura: 'F-1001' },
    });
    // ya facturada → 409
    const otra = await agente.post(`/api/ots/${ot.id}/facturar`).send({ n_factura: 'F-2' });
    expect(otra.status).toBe(409);
    expect(otra.body.error.detalles).toMatchObject({ entidad: 'ot', campo: 'estado_facturacion' });
  });

  it('interna o pendiente → 409; n_factura vacío → 400; técnico y lectura → 403; 404', async () => {
    const { agente } = await como('admin');
    const t = await crearTicket();
    const interna = await crearOt(t.id, { tipo: 'interna', etapa: 'cerrada' });
    const pendiente = await crearOt(t.id, { tipo: 'facturable', etapa: 'en_ejecucion' });
    for (const ot of [interna, pendiente]) {
      const r = await agente.post(`/api/ots/${ot.id}/facturar`).send({ n_factura: 'F-1' });
      expect(r.status).toBe(409);
      expect(r.body.error.codigo).toBe('TRANSICION_INVALIDA');
    }
    const cerrada = await crearOt(t.id, { etapa: 'cerrada' }); // por_facturar
    expect(
      (await agente.post(`/api/ots/${cerrada.id}/facturar`).send({ n_factura: '' })).status,
    ).toBe(400);
    for (const rol of ['tecnico', 'lectura'] as const) {
      const otro = await como(rol);
      expect(
        (await otro.agente.post(`/api/ots/${cerrada.id}/facturar`).send({ n_factura: 'F-1' }))
          .status,
      ).toBe(403);
    }
    expect((await fila(cerrada.id)).estado_facturacion).toBe('por_facturar');
    expect((await agente.post('/api/ots/999999/facturar').send({ n_factura: 'F-1' })).status).toBe(
      404,
    );
  });
});
