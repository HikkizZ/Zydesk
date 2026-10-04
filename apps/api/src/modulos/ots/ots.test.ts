import { describe, expect, it } from 'vitest';
import {
  crearArchivoPendiente,
  crearBolsa,
  crearCliente,
  crearContacto,
  crearCotizacion,
  crearOt,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

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

const horas = (ot_id: number, usuario_id: number, horas: number, fecha: string) =>
  dataSource.query(
    `INSERT INTO registro_horas (usuario_id, fecha, ot_id, horas) VALUES ($1, $2, $3, $4)`,
    [usuario_id, fecha, ot_id, horas],
  );

describe('POST /api/tickets/:id/convertir-en-ot', () => {
  it('crea la OT en borrador con los valores por defecto del ticket', async () => {
    const { agente, usuario } = await como('tecnico');
    const principal = await crearUsuario({ nombre: 'Ana Pérez' });
    const cliente = await crearCliente();
    const t = await crearTicket({
      estado: 'en_curso',
      cliente_id: cliente.id,
      principal_id: principal.id,
      asunto: 'Falla de la bomba',
    });
    const r = await agente
      .post(`/api/tickets/${t.id}/convertir-en-ot`)
      .send({ tipo: 'facturable' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      codigo: 'OT-0200',
      numero: 200,
      tipo: 'facturable',
      etapa: 'borrador',
      titulo: 'Falla de la bomba',
      estado_facturacion: 'pendiente',
      tipo_cambiable: true,
      cliente_id: cliente.id,
      cliente: { id: cliente.id, nombre: cliente.nombre },
      responsable_tecnico: { id: principal.id, nombre: 'Ana Pérez' },
      ticket: { id: t.id, codigo: t.codigo, asunto: 'Falla de la bomba' },
      ticket_origen: { id: t.id, estado: 'en_curso', otras_ots_abiertas: [] },
      creado_por: { id: usuario.id },
      neto: null,
      cotizacion: null,
      costo_interno: null,
      bolsa: null,
      aprobacion: null,
      tareas: [],
      archivos: [],
      horas: { estimadas: 0, reales: 0, registradas: 0 },
    });
    // el estado del ticket no cambia
    const [fila] = await dataSource.query(`SELECT estado FROM ticket WHERE id = $1`, [t.id]);
    expect(fila.estado).toBe('en_curso');
  });

  it('dos conversiones consecutivas → OT-0200 y OT-0201 (también "crear otra OT")', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const a = await agente.post(`/api/tickets/${t.id}/convertir-en-ot`).send({ tipo: 'interna' });
    const b = await agente
      .post(`/api/tickets/${t.id}/convertir-en-ot`)
      .send({ tipo: 'facturable', titulo: 'Segunda', responsable_tecnico_id: null });
    expect([a.body.codigo, b.body.codigo]).toEqual(['OT-0200', 'OT-0201']);
    expect(b.body.titulo).toBe('Segunda');
    expect(b.body.ticket_origen.otras_ots_abiertas).toEqual([
      { id: a.body.id, codigo: 'OT-0200', etapa: 'borrador' },
    ]);
    const r = await agente.get(`/api/tickets/${t.id}`);
    expect(r.body.ots.map((o: { codigo: string }) => o.codigo)).toEqual(['OT-0201', 'OT-0200']);
  });

  it('las tareas abiertas pasan a la OT y las hechas se quedan en el ticket', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const hecha = await crearTarea(t.id, { titulo: 'Hecha', hecha: true });
    await crearTarea(t.id, { titulo: 'Abierta 1' });
    await crearTarea(t.id, { titulo: 'Abierta 2' });
    const r = await agente.post(`/api/tickets/${t.id}/convertir-en-ot`).send({ tipo: 'interna' });
    expect(r.status).toBe(201);
    expect(r.body.tareas.map((x: { titulo: string }) => x.titulo)).toEqual([
      'Abierta 1',
      'Abierta 2',
    ]);
    expect(r.body.tareas.map((x: { orden: number }) => x.orden)).toEqual([1, 2]);
    expect(r.body.tareas[0]).toMatchObject({ ticket_id: null, ot_id: r.body.id });
    const detalle = await agente.get(`/api/tickets/${t.id}`);
    expect(detalle.body.tareas.map((x: { id: number }) => x.id)).toEqual([hecha.id]);

    const evT = await eventos('ticket', t.id);
    expect(evT).toHaveLength(1);
    expect(evT[0]).toMatchObject({
      accion: 'convertido_en_ot',
      valor_nuevo: 'OT-0200 · Interna',
      datos: { ot_id: r.body.id, codigo: 'OT-0200', tipo: 'interna', tareas_traspasadas: 2 },
    });
    const evO = await eventos('ot', r.body.id);
    expect(evO.map((e: { accion: string }) => e.accion)).toEqual(['creada', 'tareas_traspasadas']);
    expect(evO[0].datos).toMatchObject({
      desde_ticket: { id: t.id, codigo: t.codigo },
      tareas_traspasadas: 2,
    });
    expect(evO[1].datos).toEqual({
      desde: t.codigo,
      n: 2,
      titulos: ['Abierta 1', 'Abierta 2'],
    });
  });

  it('409 TICKET_CERRADO, 404 y ticket con OT abiertas sí permite otra', async () => {
    const { agente } = await como('tecnico');
    const cerrado = await crearTicket({ estado: 'resuelto' });
    const r = await agente
      .post(`/api/tickets/${cerrado.id}/convertir-en-ot`)
      .send({ tipo: 'facturable' });
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TICKET_CERRADO');
    expect(
      (await agente.post('/api/tickets/999999/convertir-en-ot').send({ tipo: 'facturable' }))
        .status,
    ).toBe(404);
    expect((await agente.post(`/api/tickets/${cerrado.id}/convertir-en-ot`).send({})).status).toBe(
      400,
    );
  });

  it('interna sobre un cliente interno prellena el área solicitante', async () => {
    const { agente } = await como('tecnico');
    const area = await crearCliente({ nombre: 'Contabilidad', es_interno: true });
    const t = await crearTicket({ cliente_id: area.id });
    const r = await agente.post(`/api/tickets/${t.id}/convertir-en-ot`).send({ tipo: 'interna' });
    expect(r.body.area_solicitante).toBe('Contabilidad');
    const f = await agente
      .post(`/api/tickets/${t.id}/convertir-en-ot`)
      .send({ tipo: 'facturable' });
    expect(f.body.area_solicitante).toBeNull();
  });

  it('responsable inexistente o inactivo → 400', async () => {
    const { agente } = await como('tecnico');
    const inactivo = await crearUsuario({ activo: false });
    const t = await crearTicket();
    const r = await agente
      .post(`/api/tickets/${t.id}/convertir-en-ot`)
      .send({ tipo: 'facturable', responsable_tecnico_id: inactivo.id });
    expect(r.status).toBe(400);
    expect(r.body.error.detalles).toHaveProperty('responsable_tecnico_id');
  });

  it('prueba 5: bolsa — sin bolsa vigente 400 (sin consumir número), con bolsa guarda el contrato, interna 400', async () => {
    const { agente } = await como('tecnico');
    const cliente = await crearCliente();
    const t = await crearTicket({ cliente_id: cliente.id });
    const sin = await agente
      .post(`/api/tickets/${t.id}/convertir-en-ot`)
      .send({ tipo: 'facturable', descuenta_bolsa: true });
    expect(sin.status).toBe(400);
    expect(sin.body.error.detalles).toEqual({
      descuenta_bolsa: ['El cliente no tiene bolsa vigente'],
    });
    // una bolsa ya vencida tampoco vale
    await dataSource.query(
      `INSERT INTO contrato_bolsa (cliente_id, horas_mes, vigente_desde, vigente_hasta)
       VALUES ($1, 10, '2020-01-01', '2020-12-31')`,
      [cliente.id],
    );
    expect(
      (
        await agente
          .post(`/api/tickets/${t.id}/convertir-en-ot`)
          .send({ tipo: 'facturable', descuenta_bolsa: true })
      ).status,
    ).toBe(400);

    const bolsa = await crearBolsa(cliente.id, { horas_mes: 20, vigente_desde: '2021-01-01' });
    const ok = await agente
      .post(`/api/tickets/${t.id}/convertir-en-ot`)
      .send({ tipo: 'facturable', descuenta_bolsa: true });
    expect(ok.status).toBe(201);
    expect(ok.body.codigo).toBe('OT-0200'); // los rechazos no consumieron números
    expect(ok.body.bolsa).toEqual({ contrato_id: bolsa.id, horas_mes: 20, usadas_mes: 0 });

    const interna = await agente
      .post(`/api/tickets/${t.id}/convertir-en-ot`)
      .send({ tipo: 'interna', descuenta_bolsa: true });
    expect(interna.status).toBe(400);
    expect(interna.body.error.detalles).toHaveProperty('descuenta_bolsa');
  });

  it('bolsa.usadas_mes suma solo las horas de OT con ese contrato en el mes actual', async () => {
    const { agente, usuario } = await como('tecnico');
    const cliente = await crearCliente();
    const bolsa = await crearBolsa(cliente.id);
    const otra = await crearBolsa((await crearCliente()).id);
    const t = await crearTicket({ cliente_id: cliente.id });
    const a = await crearOt(t.id, { cliente_id: cliente.id, contrato_id: bolsa.id });
    const b = await crearOt(t.id, { cliente_id: cliente.id, contrato_id: bolsa.id });
    const sinBolsa = await crearOt(t.id, { cliente_id: cliente.id });
    const deOtro = await crearOt(t.id, { contrato_id: otra.id });
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
      new Date(),
    );
    await horas(a.id, usuario.id, 2.5, hoy);
    await horas(b.id, usuario.id, 1, hoy);
    await horas(a.id, usuario.id, 8, '2021-03-10'); // otro mes
    await horas(sinBolsa.id, usuario.id, 4, hoy);
    await horas(deOtro.id, usuario.id, 6, hoy);
    const r = await agente.get(`/api/ots/${a.id}`);
    expect(r.body.bolsa).toEqual({ contrato_id: bolsa.id, horas_mes: 20, usadas_mes: 3.5 });
    expect(r.body.horas.registradas).toBe(10.5);
    expect((await agente.get(`/api/ots/${sinBolsa.id}`)).body.bolsa).toBeNull();
  });
});

describe('GET /api/ots y GET /api/ots/:id', () => {
  it('404 si no existe y detalle con tareas, horas y ticket de origen', async () => {
    const { agente } = await como('lectura');
    expect((await agente.get('/api/ots/999999')).status).toBe(404);
    const responsable = await crearUsuario({ nombre: 'Beto Soto' });
    const seguidor = await crearUsuario({ nombre: 'Carla Díaz' });
    const t = await crearTicket({ principal_id: responsable.id });
    await dataSource.query(`INSERT INTO ticket_seguidor (ticket_id, usuario_id) VALUES ($1, $2)`, [
      t.id,
      seguidor.id,
    ]);
    const ot = await crearOt(t.id, { tipo: 'interna', etapa: 'en_ejecucion' });
    await crearTarea({ ot_id: ot.id }, { titulo: 'A', horas_estimadas: 3, horas_reales: 1 });
    await crearTarea({ ot_id: ot.id }, { titulo: 'B', horas_estimadas: 2.5 });
    const otra = await crearOt(t.id, { etapa: 'borrador' });
    const r = await agente.get(`/api/ots/${ot.id}`);
    expect(r.status).toBe(200);
    expect(r.body.tipo_cambiable).toBe(false);
    expect(r.body.horas).toEqual({ estimadas: 5.5, reales: 1, registradas: 0 });
    expect(r.body.tareas.map((x: { titulo: string }) => x.titulo)).toEqual(['A', 'B']);
    expect(r.body.tareas[0]).toMatchObject({ horas_estimadas: 3, horas_reales: 1, ot_id: ot.id });
    expect(r.body.ticket_origen).toMatchObject({
      id: t.id,
      responsables: [{ id: responsable.id, principal: true }],
      seguidores: [{ id: seguidor.id }],
      otras_ots_abiertas: [{ id: otra.id, codigo: otra.codigo, etapa: 'borrador' }],
    });
  });

  it('prueba 14: filtros, búsqueda y orden', async () => {
    const { agente } = await como('lectura');
    const c1 = await crearCliente({ nombre: 'Viña Santa Clara' });
    const c2 = await crearCliente({ nombre: 'Otro' });
    const t1 = await crearTicket({ cliente_id: c1.id, asunto: 'Bomba' });
    const t2 = await crearTicket({ cliente_id: c2.id });
    const o218 = await crearOt(t1.id, {
      numero: 218,
      cliente_id: c1.id,
      titulo: 'Cambio de bomba',
    });
    const porFacturar = await crearOt(t2.id, { etapa: 'cerrada', cliente_id: c2.id });
    const facturada = await crearOt(t2.id, {
      etapa: 'cerrada',
      estado_facturacion: 'facturada',
      cliente_id: c2.id,
    });
    const interna = await crearOt(t2.id, { tipo: 'interna', etapa: 'en_ejecucion' });
    const ids = (r: { body: { datos: { id: number }[] } }) =>
      r.body.datos.map((o) => o.id).sort((a, b) => a - b);
    const orden = (...n: number[]) => [...n].sort((a, b) => a - b);

    const todas = await agente.get('/api/ots');
    expect(todas.status).toBe(200);
    expect(todas.body).toMatchObject({ total: 4, pagina: 1, por_pagina: 50 });
    expect(todas.body.datos[0]).toHaveProperty('ticket');
    expect(ids(await agente.get('/api/ots?abiertas=true'))).toEqual(orden(o218.id, interna.id));
    expect(ids(await agente.get('/api/ots?estado_facturacion=por_facturar'))).toEqual([
      porFacturar.id,
    ]);
    expect(ids(await agente.get('/api/ots?estado_facturacion=facturada,por_facturar'))).toEqual(
      orden(porFacturar.id, facturada.id),
    );
    expect(ids(await agente.get('/api/ots?q=218'))).toEqual([o218.id]);
    expect(ids(await agente.get('/api/ots?q=OT-218'))).toEqual([o218.id]);
    expect(ids(await agente.get('/api/ots?q=bomba'))).toEqual([o218.id]);
    expect(ids(await agente.get(`/api/ots?q=${t1.codigo}`))).toEqual([o218.id]);
    expect(ids(await agente.get('/api/ots?q=Santa'))).toEqual([o218.id]);
    expect(ids(await agente.get(`/api/ots?cliente_id=${c2.id}`))).toEqual(
      orden(porFacturar.id, facturada.id),
    );
    expect(ids(await agente.get(`/api/ots?ticket_id=${t1.id}`))).toEqual([o218.id]);
    expect(ids(await agente.get('/api/ots?tipo=interna'))).toEqual([interna.id]);
    expect(ids(await agente.get('/api/ots?etapa=cerrada'))).toEqual(
      orden(porFacturar.id, facturada.id),
    );
    const pag = await agente.get('/api/ots?por_pagina=2&pagina=2&orden=-creado_en');
    expect(pag.body.datos.map((o: { id: number }) => o.id)).toEqual([porFacturar.id, o218.id]);
    expect((await agente.get('/api/ots?orden=numero')).status).toBe(400);
  });

  it('7D: el neto de la lista solo con reportes.ver; el detalle lo conserva', async () => {
    const t = await crearTicket();
    const ot = await crearOt(t.id, { etapa: 'cerrada' });
    await crearOt(t.id, { tipo: 'interna', etapa: 'en_ejecucion' });
    await crearCotizacion(ot.id, {
      estado: 'aprobada',
      lineas: [{ cantidad: 1, precio_unitario: 475_000 }],
    });
    const netos = (r: { body: { datos: { neto: number | null }[] } }) =>
      r.body.datos.map((o) => o.neto);
    const tecnico = await como('tecnico');
    const lista = await tecnico.agente.get('/api/ots');
    expect(lista.status).toBe(200);
    expect(lista.body.datos).toHaveLength(2);
    expect(netos(lista)).toEqual([null, null]);
    const lectura = await (await como('lectura')).agente.get('/api/ots');
    expect(netos(lectura)).toContain(475_000);
    const detalle = await tecnico.agente.get(`/api/ots/${ot.id}`);
    expect(detalle.body.neto).toBe(475_000);
    expect(detalle.body.cotizacion.neto).toBe(475_000);
  });

  it('vencida: término pasado y no final', async () => {
    const { agente } = await como('lectura');
    const t = await crearTicket();
    const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
    const cerrada = await crearOt(t.id, { etapa: 'cerrada' });
    await dataSource.query(`UPDATE ot SET termino = '2020-01-01' WHERE id = ANY($1)`, [
      [ot.id, cerrada.id],
    ]);
    expect((await agente.get(`/api/ots/${ot.id}`)).body).toMatchObject({
      vencida: true,
      termino: '2020-01-01',
    });
    expect((await agente.get(`/api/ots/${cerrada.id}`)).body.vencida).toBe(false);
  });
});

describe('PATCH /api/ots/:id', () => {
  it('prueba 4: el tipo solo cambia en borrador y limpia los campos del otro tipo', async () => {
    const { agente } = await como('tecnico');
    const cliente = await crearCliente();
    const contacto = await crearContacto(cliente.id);
    const bolsa = await crearBolsa(cliente.id);
    const t = await crearTicket({ cliente_id: cliente.id });
    const ot = await crearOt(t.id, { tipo: 'facturable', cliente_id: cliente.id });
    const cargar = await agente.patch(`/api/ots/${ot.id}`).send({
      contacto_id: contacto.id,
      oc_cliente: 'OC-1',
      condicion_pago: '30 días',
      descuenta_bolsa: true,
    });
    expect(cargar.status).toBe(200);
    expect(cargar.body).toMatchObject({
      contacto: { id: contacto.id },
      oc_cliente: 'OC-1',
      bolsa: { contrato_id: bolsa.id },
    });

    const r = await agente.patch(`/api/ots/${ot.id}`).send({ tipo: 'interna' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      tipo: 'interna',
      estado_facturacion: 'no_aplica',
      contacto: null,
      oc_cliente: null,
      condicion_pago: null,
      bolsa: null,
    });
    const cambio = (await eventos('ot', ot.id)).find((e: { campo: string }) => e.campo === 'tipo');
    expect(cambio).toMatchObject({
      accion: 'cambio',
      valor_anterior: 'Facturable · externa',
      valor_nuevo: 'Interna · no facturable',
    });

    const vuelve = await agente
      .patch(`/api/ots/${ot.id}`)
      .send({ centro_costo: 'CC-1', area_solicitante: 'Planta' });
    expect(vuelve.body).toMatchObject({ centro_costo: 'CC-1', area_solicitante: 'Planta' });
    const fact = await agente.patch(`/api/ots/${ot.id}`).send({ tipo: 'facturable' });
    expect(fact.body).toMatchObject({
      tipo: 'facturable',
      estado_facturacion: 'pendiente',
      centro_costo: null,
      area_solicitante: null,
    });

    // fuera de borrador: 409 OT_TIPO_BLOQUEADO
    await dataSource.query(`UPDATE ot SET etapa = 'cotizada' WHERE id = $1`, [ot.id]);
    const bloqueado = await agente.patch(`/api/ots/${ot.id}`).send({ tipo: 'interna' });
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.body.error.codigo).toBe('OT_TIPO_BLOQUEADO');
    // mismo tipo no es un cambio
    expect((await agente.patch(`/api/ots/${ot.id}`).send({ tipo: 'facturable' })).status).toBe(200);
  });

  it('campos del otro tipo → 400 por campo', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const fact = await crearOt(t.id, { tipo: 'facturable' });
    const interna = await crearOt(t.id, { tipo: 'interna' });
    const a = await agente.patch(`/api/ots/${fact.id}`).send({ centro_costo: 'CC' });
    expect(a.status).toBe(400);
    expect(a.body.error.detalles).toHaveProperty('centro_costo');
    const b = await agente
      .patch(`/api/ots/${interna.id}`)
      .send({ oc_cliente: 'OC', descuenta_bolsa: true });
    expect(b.status).toBe(400);
    expect(Object.keys(b.body.error.detalles)).toEqual(['oc_cliente', 'descuenta_bolsa']);
  });

  it('409 OT_CERRADA con la OT cerrada o cancelada', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    for (const etapa of ['cerrada', 'cancelada'] as const) {
      const ot = await crearOt(t.id, { etapa });
      const r = await agente.patch(`/api/ots/${ot.id}`).send({ titulo: 'Nuevo' });
      expect(r.status).toBe(409);
      expect(r.body.error.codigo).toBe('OT_CERRADA');
    }
    expect((await agente.patch('/api/ots/999999').send({ titulo: 'x' })).status).toBe(404);
  });

  it('cliente: solo en borrador, activo, y limpia contacto y bolsa', async () => {
    const { agente } = await como('tecnico');
    const c1 = await crearCliente();
    const c2 = await crearCliente();
    const inactivo = await crearCliente({ activo: false });
    const contacto = await crearContacto(c1.id);
    const ajeno = await crearContacto(c2.id);
    const bolsa = await crearBolsa(c1.id);
    const t = await crearTicket({ cliente_id: c1.id });
    const ot = await crearOt(t.id, { cliente_id: c1.id });
    await agente
      .patch(`/api/ots/${ot.id}`)
      .send({ contacto_id: contacto.id, descuenta_bolsa: true });
    // contacto de otro cliente
    const mal = await agente.patch(`/api/ots/${ot.id}`).send({ contacto_id: ajeno.id });
    expect(mal.status).toBe(400);
    expect(mal.body.error.detalles).toHaveProperty('contacto_id');
    expect((await agente.patch(`/api/ots/${ot.id}`).send({ cliente_id: inactivo.id })).status).toBe(
      400,
    );

    const r = await agente.patch(`/api/ots/${ot.id}`).send({ cliente_id: c2.id });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ cliente_id: c2.id, contacto: null, bolsa: null });
    void bolsa;
    // nuevo cliente con su contacto en la misma petición
    const c3 = await agente
      .patch(`/api/ots/${ot.id}`)
      .send({ cliente_id: c1.id, contacto_id: contacto.id });
    expect(c3.body).toMatchObject({ cliente_id: c1.id, contacto: { id: contacto.id } });

    await dataSource.query(`UPDATE ot SET etapa = 'aprobada' WHERE id = $1`, [ot.id]);
    const bloqueado = await agente.patch(`/api/ots/${ot.id}`).send({ cliente_id: c2.id });
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.body.error.mensaje).toBe('El cliente solo se cambia en Borrador');
  });

  it('prueba 10: aprobador debe poder aprobar OT; por_aprobar se publica al asignarlo', async () => {
    const { agente } = await como('tecnico');
    const tecnico = await crearUsuario({ rol: 'tecnico' });
    const coord = await crearUsuario({ rol: 'coordinacion' });
    const inactivo = await crearUsuario({ rol: 'admin', activo: false });
    const t = await crearTicket();
    const ot = await crearOt(t.id, { tipo: 'interna' });
    for (const u of [tecnico, inactivo]) {
      const r = await agente.patch(`/api/ots/${ot.id}`).send({ aprobador_id: u.id });
      expect(r.status).toBe(400);
      expect(r.body.error.detalles).toHaveProperty('aprobador_id');
    }
    const { eventosDominio } = await import('../../core/eventos/dominio.js');
    const recibidos: unknown[] = [];
    const oyente = (d: unknown) => recibidos.push(d);
    eventosDominio.on('ot.por_aprobar', oyente);
    try {
      const ok = await agente.patch(`/api/ots/${ot.id}`).send({ aprobador_id: coord.id });
      expect(ok.status).toBe(200);
      expect(ok.body.aprobador).toMatchObject({ id: coord.id });
      // repetir el mismo aprobador no vuelve a avisar
      await agente.patch(`/api/ots/${ot.id}`).send({ aprobador_id: coord.id });
    } finally {
      eventosDominio.off('ot.por_aprobar', oyente);
    }
    expect(recibidos).toEqual([{ ot_id: ot.id, aprobador_id: coord.id }]);
  });

  it('fechas, responsable y un evento cambio por campo modificado', async () => {
    const { agente } = await como('tecnico');
    const nuevo = await crearUsuario({ nombre: 'Dani Rojas' });
    const inactivo = await crearUsuario({ activo: false });
    const t = await crearTicket();
    const ot = await crearOt(t.id, { tipo: 'interna' });
    expect(
      (
        await agente
          .patch(`/api/ots/${ot.id}`)
          .send({ inicio: '2026-10-05', termino: '2026-10-01' })
      ).status,
    ).toBe(400);
    expect(
      (await agente.patch(`/api/ots/${ot.id}`).send({ responsable_tecnico_id: inactivo.id }))
        .status,
    ).toBe(400);
    // término contra el inicio ya guardado
    await agente.patch(`/api/ots/${ot.id}`).send({ inicio: '2026-10-05' });
    const r0 = await agente.patch(`/api/ots/${ot.id}`).send({ termino: '2026-10-01' });
    expect(r0.status).toBe(400);
    expect(r0.body.error.detalles).toHaveProperty('termino');

    const antes = (await eventos('ot', ot.id)).length;
    const r = await agente.patch(`/api/ots/${ot.id}`).send({
      titulo: 'Nuevo título',
      alcance: 'Alcance',
      responsable_tecnico_id: nuevo.id,
      termino: '2026-10-09',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      titulo: 'Nuevo título',
      termino: '2026-10-09',
      inicio: '2026-10-05',
    });
    const evs = (await eventos('ot', ot.id)).slice(antes);
    expect(evs.map((e: { campo: string }) => e.campo).sort()).toEqual(
      ['alcance', 'responsable_tecnico', 'termino', 'titulo'].sort(),
    );
    expect(evs.find((e: { campo: string }) => e.campo === 'termino')).toMatchObject({
      valor_anterior: null,
      valor_nuevo: '9 oct 2026',
    });
    // sin cambios reales no hay eventos nuevos
    await agente.patch(`/api/ots/${ot.id}`).send({ titulo: 'Nuevo título' });
    expect((await eventos('ot', ot.id)).length).toBe(antes + 4);
  });
});

describe('POST /api/ots/:id/archivos (prueba 13)', () => {
  it('asocia pendientes propios, registra el evento y los devuelve', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket();
    const ot = await crearOt(t.id);
    const foto = await crearArchivoPendiente(usuario.id, { tipo_mime: 'image/png' });
    const doc = await crearArchivoPendiente(usuario.id, {
      tipo_mime: 'text/csv',
      nombre: 'acta.csv',
    });
    const r = await agente
      .post(`/api/ots/${ot.id}/archivos`)
      .send({ archivo_ids: [foto.id, doc.id] });
    expect(r.status).toBe(200);
    expect(r.body.map((a: { id: number }) => a.id)).toEqual([foto.id, doc.id]);
    const [ev] = (await eventos('ot', ot.id)).filter(
      (e: { accion: string }) => e.accion === 'archivos_agregados',
    );
    expect(ev.datos).toEqual({ n: 2, nombres: [foto.nombre_original, 'acta.csv'] });
    const detalle = await agente.get(`/api/ots/${ot.id}`);
    expect(detalle.body.archivos).toHaveLength(2);
    // un documento no visible en línea (csv) de OT se descarga y audita como attachment; la imagen inline no
    const d = await agente.get(`/api/archivos/${doc.id}`);
    expect(d.status).toBe(200);
    const aud = await dataSource.query(
      `SELECT detalle FROM auditoria WHERE accion = 'descarga_archivo'`,
    );
    expect(aud).toHaveLength(1);
    expect(aud[0].detalle).toMatchObject({ archivo_id: doc.id, entidad: 'ot', entidad_id: ot.id });
  });

  it('pendiente ajeno o ya asociado → 400; OT cerrada → 409; vacío → 400; 404', async () => {
    const { agente, usuario } = await como('tecnico');
    const otro = await crearUsuario();
    const t = await crearTicket();
    const ot = await crearOt(t.id);
    const ajeno = await crearArchivoPendiente(otro.id);
    const r = await agente.post(`/api/ots/${ot.id}/archivos`).send({ archivo_ids: [ajeno.id] });
    expect(r.status).toBe(400);
    expect(r.body.error.detalles).toHaveProperty('archivo_ids');
    expect((await agente.post(`/api/ots/${ot.id}/archivos`).send({ archivo_ids: [] })).status).toBe(
      400,
    );
    const cerrada = await crearOt(t.id, { etapa: 'cerrada' });
    const propio = await crearArchivoPendiente(usuario.id);
    const c = await agente
      .post(`/api/ots/${cerrada.id}/archivos`)
      .send({ archivo_ids: [propio.id] });
    expect(c.status).toBe(409);
    expect(c.body.error.codigo).toBe('OT_CERRADA');
    expect(
      (await agente.post('/api/ots/999999/archivos').send({ archivo_ids: [propio.id] })).status,
    ).toBe(404);
  });
});

describe('numeración conectada (§4.8)', () => {
  it('PUT /api/config/numeracion con ot.inicial ≤ MAX(numero) → 400 NUMERACION_INICIAL_MENOR', async () => {
    const { agente } = await como('admin');
    const t = await crearTicket();
    const c = await agente.post(`/api/tickets/${t.id}/convertir-en-ot`).send({ tipo: 'interna' });
    expect(c.body.codigo).toBe('OT-0200');
    const cuerpo = (inicial: number) => ({
      ticket: { prefijo: 'TK-', inicial: 1000, digitos: 4, modo: 'correlativo' },
      ot: { prefijo: 'OT-', inicial, digitos: 4 },
    });
    const r = await agente.put('/api/config/numeracion').send(cuerpo(150));
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('NUMERACION_INICIAL_MENOR');
    const ok = await agente.put('/api/config/numeracion').send(cuerpo(300));
    expect(ok.status).toBe(200);
    expect(ok.body.ot).toMatchObject({ inicial: 300, ultimo_usado: 200 });
    const d = await agente.post(`/api/tickets/${t.id}/convertir-en-ot`).send({ tipo: 'interna' });
    expect(d.body.codigo).toBe('OT-0300');
  });
});

describe('PATCH /api/ots/:id — datos comerciales de una OT aprobada', () => {
  async function otEn(etapa: 'borrador' | 'en_ejecucion') {
    const t = await crearTicket();
    const cliente = await crearCliente();
    const ot = await crearOt(t.id, { etapa, cliente_id: cliente.id });
    await dataSource.query(`UPDATE ot SET oc_cliente = 'OC-1' WHERE id = $1`, [ot.id]);
    return ot;
  }
  const ocDe = async (id: number): Promise<string | null> =>
    (await dataSource.query(`SELECT oc_cliente FROM ot WHERE id = $1`, [id]))[0].oc_cliente;

  it('técnico cambia oc_cliente en en_ejecucion → 403 SIN_PERMISO con campos, sin escribir', async () => {
    const { agente } = await como('tecnico');
    const ot = await otEn('en_ejecucion');
    const r = await agente
      .patch(`/api/ots/${ot.id}`)
      .send({ oc_cliente: 'OC-2', condicion_pago: '30 días', titulo: 'Otro' });
    expect(r.status).toBe(403);
    expect(r.body.error.codigo).toBe('SIN_PERMISO');
    expect(r.body.error.detalles.campos).toEqual(['oc_cliente', 'condicion_pago']);
    expect(await ocDe(ot.id)).toBe('OC-1');
    expect(await eventos('ot', ot.id)).toHaveLength(0);
  });

  it('técnico cambia el alcance, o reenvía el mismo oc_cliente, en en_ejecucion → 200', async () => {
    const { agente } = await como('tecnico');
    const ot = await otEn('en_ejecucion');
    expect(
      (await agente.patch(`/api/ots/${ot.id}`).send({ alcance: 'Nuevo alcance' })).status,
    ).toBe(200);
    expect((await agente.patch(`/api/ots/${ot.id}`).send({ oc_cliente: 'OC-1' })).status).toBe(200);
  });

  it('coordinación cambia oc_cliente en en_ejecucion → 200 con evento', async () => {
    const { agente } = await como('coordinacion');
    const ot = await otEn('en_ejecucion');
    const r = await agente.patch(`/api/ots/${ot.id}`).send({ oc_cliente: 'OC-2' });
    expect(r.status).toBe(200);
    expect(await ocDe(ot.id)).toBe('OC-2');
    expect(
      (await eventos('ot', ot.id)).some((e: { campo: string | null }) => e.campo === 'oc_cliente'),
    ).toBe(true);
  });

  it('técnico cambia oc_cliente en borrador → 200', async () => {
    const { agente } = await como('tecnico');
    const ot = await otEn('borrador');
    expect((await agente.patch(`/api/ots/${ot.id}`).send({ oc_cliente: 'OC-3' })).status).toBe(200);
    expect(await ocDe(ot.id)).toBe('OC-3');
  });
});
