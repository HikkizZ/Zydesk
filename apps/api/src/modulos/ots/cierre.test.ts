import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  crearCliente,
  crearOt,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { eventosDominio } from '../../core/eventos/dominio.js';
import { dataSourceOwner } from '../../database/data-source-owner.js';

// Envuelve `efectosCierreOt` para poder comprobar que el servicio depende de ella (F3-T8).
const efectosMock = vi.hoisted(() => ({ cambio: null as null | Record<string, unknown> }));
vi.mock('@zydesk/shared', async (original) => {
  const real = await original<typeof import('@zydesk/shared')>();
  return {
    ...real,
    efectosCierreOt: (...args: Parameters<typeof real.efectosCierreOt>) => {
      const e = real.efectosCierreOt(...args);
      return efectosMock.cambio ? { ...e, ...efectosMock.cambio } : e;
    },
  };
});

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura' = 'coordinacion') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const eventos = (entidad: 'ot' | 'ticket', id: number) =>
  dataSource.query(
    `SELECT accion, campo, valor_anterior, valor_nuevo, datos, req_id FROM evento
      WHERE entidad = $1 AND entidad_id = $2 ORDER BY id`,
    [entidad, String(id)],
  );
const filaOt = async (id: number) =>
  (await dataSource.query(`SELECT * FROM ot WHERE id = $1`, [id]))[0];
const filaTicket = async (id: number) =>
  (await dataSource.query(`SELECT * FROM ticket WHERE id = $1`, [id]))[0];
const hoy = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

async function conteos() {
  const [c] = await dataSource.query(
    `SELECT (SELECT count(*) FROM mensaje)::int AS mensajes, (SELECT count(*) FROM evento)::int AS eventos,
            (SELECT count(*) FROM tarea)::int AS tareas, (SELECT count(*) FROM ot)::int AS ots,
            (SELECT count(*) FROM tarea WHERE ot_id IS NOT NULL)::int AS tareas_ot`,
  );
  return c as Record<string, number>;
}

// Ticket en curso con un responsable principal, uno secundario y un seguidor; OT en ejecución.
async function escenario(
  datos: {
    tipo?: 'facturable' | 'interna';
    ticketEstado?: 'nuevo' | 'en_curso' | 'en_espera';
  } = {},
) {
  const principal = await crearUsuario({ nombre: 'Principal Uno' });
  const otro = await crearUsuario({ nombre: 'Otro Dos' });
  const seguidor = await crearUsuario({ nombre: 'Seguidor Tres' });
  const cliente = await crearCliente();
  const ticket = await crearTicket({
    estado: datos.ticketEstado ?? 'en_curso',
    cliente_id: cliente.id,
    principal_id: principal.id,
    otros_ids: [otro.id],
  });
  await dataSource.query(`INSERT INTO ticket_seguidor (ticket_id, usuario_id) VALUES ($1, $2)`, [
    ticket.id,
    seguidor.id,
  ]);
  const ot = await crearOt(ticket.id, {
    tipo: datos.tipo ?? 'facturable',
    etapa: 'en_ejecucion',
    cliente_id: cliente.id,
    responsable_tecnico_id: principal.id,
  });
  return { principal, otro, seguidor, cliente, ticket, ot };
}

afterEach(() => {
  efectosMock.cambio = null;
});

describe('cerrar OT: resolvió el ticket (prueba 7a)', () => {
  it('facturable → cerrada, por_facturar, ticket resuelto, seguimiento en OT y en ticket, eventos', async () => {
    const { agente, usuario } = await como();
    const { ticket, ot, principal, otro, seguidor } = await escenario();
    const recibidos: unknown[] = [];
    const oyente = (d: unknown) => recibidos.push(d);
    eventosDominio.on('ot.cerrada', oyente);
    const porFacturar = vi.fn();
    eventosDominio.on('ot.por_facturar', porFacturar);
    try {
      const r = await agente
        .post(`/api/ots/${ot.id}/cerrar`)
        .send({ resolvio_ticket: true, resumen: 'Trabajo terminado' });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({
        etapa: 'cerrada',
        estado_facturacion: 'por_facturar',
        resolvio_ticket: true,
        resumen_cierre: 'Trabajo terminado',
      });
      expect(r.body.cerrada_por.id).toBe(usuario.id);
      expect(r.body.termino).toBe(hoy());

      const t = await filaTicket(ticket.id);
      expect(t.estado).toBe('resuelto');
      expect(t.cerrado_en).not.toBeNull();

      // seguimiento en la OT y copia en el ticket
      const enOt = await dataSource.query(
        `SELECT id, tipo, texto, autor_id FROM mensaje WHERE ot_id = $1`,
        [ot.id],
      );
      expect(enOt).toEqual([
        expect.objectContaining({
          tipo: 'seguimiento',
          texto: 'Trabajo terminado',
          autor_id: usuario.id,
        }),
      ]);
      const act = await agente.get(`/api/tickets/${ticket.id}/actividad`);
      const copia = act.body.items.find(
        (i: { tipo: string; mensaje?: { copiado_de: unknown } }) =>
          i.tipo === 'mensaje' && i.mensaje?.copiado_de,
      );
      expect(copia.mensaje.copiado_de).toMatchObject({
        mensaje_id: enOt[0].id,
        ot: { id: ot.id, codigo: ot.codigo },
      });
      expect(copia.mensaje.texto).toBe('Trabajo terminado');
      expect(t.primera_respuesta_en).not.toBeNull();

      // eventos
      const evOt = await eventos('ot', ot.id);
      expect(evOt.map((e: { campo: string }) => e.campo)).toEqual(['etapa', 'estado_facturacion']);
      expect(evOt[0]).toMatchObject({
        valor_anterior: 'En ejecución',
        valor_nuevo: 'Cerrada',
        datos: { resolvio_ticket: true, siguiente: null },
      });
      expect(evOt[1]).toMatchObject({ valor_anterior: 'Pendiente', valor_nuevo: 'Por facturar' });
      expect(evOt[0].req_id).toBe(r.headers['x-request-id']);
      const evTk = await eventos('ticket', ticket.id);
      const cerrada = evTk.find((e: { accion: string }) => e.accion === 'ot_cerrada');
      expect(cerrada).toMatchObject({
        valor_nuevo: `${ot.codigo} cerrada · resolvió el ticket`,
        datos: {
          ot_id: ot.id,
          codigo: ot.codigo,
          resolvio_ticket: true,
          resumen: 'Trabajo terminado',
        },
      });
      expect(evTk.filter((e: { campo: string }) => e.campo === 'estado')).toEqual([
        expect.objectContaining({ valor_anterior: 'En curso', valor_nuevo: 'Resuelto' }),
      ]);

      // eventos de dominio, tras el commit
      expect(recibidos).toHaveLength(1);
      const d = recibidos[0] as { destinatarios_ids: number[] };
      expect(d).toMatchObject({ ot_id: ot.id, ticket_id: ticket.id, resolvio_ticket: true });
      expect([...d.destinatarios_ids].sort()).toEqual([principal.id, otro.id, seguidor.id].sort());
      expect(porFacturar).toHaveBeenCalledWith({ ot_id: ot.id });
    } finally {
      eventosDominio.off('ot.cerrada', oyente);
      eventosDominio.off('ot.por_facturar', porFacturar);
    }
  });

  it('interna → no_aplica, sin evento de facturación ni ot.por_facturar', async () => {
    const { agente } = await como('admin');
    const { ticket, ot } = await escenario({ tipo: 'interna' });
    const porFacturar = vi.fn();
    eventosDominio.on('ot.por_facturar', porFacturar);
    try {
      const r = await agente
        .post(`/api/ots/${ot.id}/cerrar`)
        .send({ resolvio_ticket: true, resumen: 'Listo' });
      expect(r.status).toBe(200);
      expect(r.body.estado_facturacion).toBe('no_aplica');
      expect((await filaTicket(ticket.id)).estado).toBe('resuelto');
      const evOt = await eventos('ot', ot.id);
      expect(evOt.map((e: { campo: string }) => e.campo)).toEqual(['etapa']);
      expect(porFacturar).not.toHaveBeenCalled();
    } finally {
      eventosDominio.off('ot.por_facturar', porFacturar);
    }
  });

  it('conserva un termino ya fijado', async () => {
    const { agente } = await como();
    const { ot } = await escenario();
    await dataSource.query(`UPDATE ot SET termino = '2099-01-31' WHERE id = $1`, [ot.id]);
    const r = await agente
      .post(`/api/ots/${ot.id}/cerrar`)
      .send({ resolvio_ticket: true, resumen: 'Listo' });
    expect(r.status).toBe(200);
    expect(r.body.termino).toBe('2099-01-31');
  });

  it('resolvió con otra OT abierta → 409 OT_ABIERTA y no se escribe nada (prueba 7e)', async () => {
    const { agente } = await como();
    const { ticket, ot } = await escenario();
    const otra = await crearOt(ticket.id, { etapa: 'aprobada' });
    const antes = await conteos();
    const r = await agente
      .post(`/api/ots/${ot.id}/cerrar`)
      .send({ resolvio_ticket: true, resumen: 'Listo' });
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('OT_ABIERTA');
    expect(r.body.error.detalles.ots).toEqual([
      { id: otra.id, codigo: otra.codigo, etapa: 'aprobada' },
    ]);
    expect(await conteos()).toEqual(antes);
    expect((await filaOt(ot.id)).etapa).toBe('en_ejecucion');
    // no resolver sí se puede con otra OT abierta
    const ok = await agente.post(`/api/ots/${ot.id}/cerrar`).send({
      resolvio_ticket: false,
      resumen: 'Parcial',
      siguiente: { accion: 'en_curso', responsable_id: (await crearUsuario()).id },
    });
    expect(ok.status).toBe(200);
  });
});

describe('cerrar OT: no resolvió (prueba 7b, 7c, 7d)', () => {
  it('en_curso con responsable nuevo: ticket en curso, principal cambiado, el anterior pasa a otros', async () => {
    const { agente } = await como();
    const { ticket, ot, principal, otro } = await escenario({ ticketEstado: 'en_espera' });
    const nuevo = await crearUsuario({ nombre: 'Nuevo Cuatro' });
    const r = await agente.post(`/api/ots/${ot.id}/cerrar`).send({
      resolvio_ticket: false,
      resumen: 'Falta una pieza',
      siguiente: { accion: 'en_curso', responsable_id: nuevo.id },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ etapa: 'cerrada', resolvio_ticket: false });
    const t = await filaTicket(ticket.id);
    expect(t).toMatchObject({ estado: 'en_curso', espera_de: null, cerrado_en: null });
    const resp = await dataSource.query(
      `SELECT usuario_id, principal FROM ticket_responsable WHERE ticket_id = $1 ORDER BY usuario_id`,
      [ticket.id],
    );
    expect(resp.find((x: { principal: boolean }) => x.principal).usuario_id).toBe(nuevo.id);
    expect(
      resp
        .filter((x: { principal: boolean }) => !x.principal)
        .map((x: { usuario_id: number }) => x.usuario_id)
        .sort(),
    ).toEqual([principal.id, otro.id].sort());
    const evTk = await eventos('ticket', ticket.id);
    expect(evTk.find((e: { accion: string }) => e.accion === 'ot_cerrada')).toMatchObject({
      valor_nuevo: `${ot.codigo} cerrada · no resolvió el ticket`,
      datos: { siguiente: { accion: 'en_curso', responsable_id: nuevo.id } },
    });
    expect(evTk.some((e: { campo: string }) => e.campo === 'responsable_principal')).toBe(true);
  });

  it('en_curso con el ticket ya en curso no genera cambio de estado', async () => {
    const { agente } = await como();
    const { ticket, ot, principal } = await escenario();
    const r = await agente.post(`/api/ots/${ot.id}/cerrar`).send({
      resolvio_ticket: false,
      resumen: 'Sigue',
      siguiente: { accion: 'en_curso', responsable_id: principal.id },
    });
    expect(r.status).toBe(200);
    const evTk = await eventos('ticket', ticket.id);
    expect(evTk.some((e: { campo: string }) => e.campo === 'estado')).toBe(false);
  });

  it('en_espera con espera_de repuesto: ticket en espera y responsable asignado', async () => {
    const { agente } = await como();
    const { ticket, ot, otro } = await escenario();
    const r = await agente.post(`/api/ots/${ot.id}/cerrar`).send({
      resolvio_ticket: false,
      resumen: 'Se espera el repuesto',
      siguiente: {
        accion: 'en_espera',
        responsable_id: otro.id,
        espera_de: 'repuesto',
        espera_detalle: 'Llega el viernes',
      },
    });
    expect(r.status).toBe(200);
    expect(await filaTicket(ticket.id)).toMatchObject({
      estado: 'en_espera',
      espera_de: 'repuesto',
      espera_detalle: 'Llega el viernes',
    });
    const [p] = await dataSource.query(
      `SELECT usuario_id FROM ticket_responsable WHERE ticket_id = $1 AND principal`,
      [ticket.id],
    );
    expect(p.usuario_id).toBe(otro.id);
  });

  it('en_espera con el ticket ya en espera: solo actualiza espera_de y deja un evento de estado', async () => {
    const { agente } = await como();
    const { ticket, ot, principal } = await escenario({ ticketEstado: 'en_espera' });
    const r = await agente.post(`/api/ots/${ot.id}/cerrar`).send({
      resolvio_ticket: false,
      resumen: 'Ahora se espera un repuesto',
      siguiente: { accion: 'en_espera', responsable_id: principal.id, espera_de: 'repuesto' },
    });
    expect(r.status).toBe(200);
    expect(await filaTicket(ticket.id)).toMatchObject({
      estado: 'en_espera',
      espera_de: 'repuesto',
    });
    const evEstado = (await eventos('ticket', ticket.id)).filter(
      (e: { campo: string }) => e.campo === 'estado',
    );
    expect(evEstado).toEqual([
      expect.objectContaining({ valor_anterior: 'En espera', valor_nuevo: 'En espera · repuesto' }),
    ]);
  });

  it('nueva_ot: borrador del mismo tipo con las tareas no hechas; la cerrada conserva las hechas', async () => {
    const { agente } = await como();
    const { ticket, ot, principal, cliente } = await escenario();
    const nuevo = await crearUsuario();
    await dataSource.query(
      `UPDATE ot SET alcance = 'Alcance original', titulo = 'Título original', centro_costo = NULL WHERE id = $1`,
      [ot.id],
    );
    const hecha = await crearTarea({ ot_id: ot.id }, { titulo: 'Hecha', hecha: true });
    const a = await crearTarea({ ot_id: ot.id }, { titulo: 'Pendiente A', horas_estimadas: 2 });
    const b = await crearTarea({ ot_id: ot.id }, { titulo: 'Pendiente B' });

    const r = await agente.post(`/api/ots/${ot.id}/cerrar`).send({
      resolvio_ticket: false,
      resumen: 'Quedó pendiente',
      siguiente: { accion: 'nueva_ot', responsable_id: nuevo.id },
    });
    expect(r.status).toBe(200);
    expect(r.body.tareas.map((x: { id: number }) => x.id)).toEqual([hecha.id]);
    expect(r.body.ticket_origen.otras_ots_abiertas).toHaveLength(1);
    const abierta = r.body.ticket_origen.otras_ots_abiertas[0];
    expect(abierta.codigo).toBe('OT-0200');

    const n = await filaOt(abierta.id);
    expect(n).toMatchObject({
      tipo: 'facturable',
      etapa: 'borrador',
      titulo: 'Título original',
      alcance: 'Alcance original',
      responsable_tecnico_id: nuevo.id,
      cliente_id: cliente.id,
      estado_facturacion: 'pendiente',
      ticket_id: ticket.id,
      creado_por: expect.any(Number),
    });
    const tareas = await dataSource.query(
      `SELECT id, orden, ot_id FROM tarea WHERE ot_id = $1 ORDER BY orden`,
      [abierta.id],
    );
    expect(tareas.map((t: { id: number; orden: number }) => [t.id, t.orden])).toEqual([
      [a.id, 1],
      [b.id, 2],
    ]);

    expect((await filaTicket(ticket.id)).estado).toBe('en_curso');
    const [p] = await dataSource.query(
      `SELECT usuario_id FROM ticket_responsable WHERE ticket_id = $1 AND principal`,
      [ticket.id],
    );
    expect(p.usuario_id).toBe(nuevo.id);
    expect(principal.id).not.toBe(nuevo.id);

    const evNueva = await eventos('ot', abierta.id);
    expect(evNueva.map((e: { accion: string }) => e.accion)).toEqual([
      'creada',
      'tareas_traspasadas',
    ]);
    expect(evNueva[0].datos).toMatchObject({
      desde_ticket: { id: ticket.id, codigo: ticket.codigo },
      desde_ot: { id: ot.id, codigo: ot.codigo },
      codigo: 'OT-0200',
      tareas_traspasadas: 2,
    });
    const evTk = await eventos('ticket', ticket.id);
    expect(evTk.find((e: { accion: string }) => e.accion === 'convertido_en_ot')).toMatchObject({
      valor_nuevo: 'OT-0200 · Facturable',
      datos: {
        ot_id: abierta.id,
        tareas_traspasadas: 2,
        desde_ot: { id: ot.id, codigo: ot.codigo },
      },
    });
  });

  it('nueva_ot de una OT interna nace interna y no_aplica', async () => {
    const { agente } = await como();
    const { ot } = await escenario({ tipo: 'interna' });
    const r = await agente.post(`/api/ots/${ot.id}/cerrar`).send({
      resolvio_ticket: false,
      resumen: 'Sigue',
      siguiente: { accion: 'nueva_ot', responsable_id: (await crearUsuario()).id },
    });
    expect(r.status).toBe(200);
    const nueva = await filaOt(r.body.ticket_origen.otras_ots_abiertas[0].id);
    expect(nueva).toMatchObject({ tipo: 'interna', estado_facturacion: 'no_aplica' });
  });
});

describe('cerrar OT: validaciones y rollback (prueba 7f, 7g)', () => {
  it('resumen vacío o ausente → 400; falta siguiente → 400; nada cambia', async () => {
    const { agente } = await como();
    const { ot, principal } = await escenario();
    const antes = await conteos();
    for (const cuerpo of [
      { resolvio_ticket: true, resumen: '' },
      { resolvio_ticket: true, resumen: '   ' },
      { resolvio_ticket: true },
      { resolvio_ticket: false, resumen: 'x' },
      {
        resolvio_ticket: false,
        resumen: 'x',
        siguiente: { accion: 'en_espera', responsable_id: principal.id },
      },
    ]) {
      expect((await agente.post(`/api/ots/${ot.id}/cerrar`).send(cuerpo)).status).toBe(400);
    }
    expect(await conteos()).toEqual(antes);
    expect((await filaOt(ot.id)).etapa).toBe('en_ejecucion');
  });

  it('responsable_id inexistente o inactivo → 400 VALIDACION y rollback total', async () => {
    const { agente } = await como();
    const { ticket, ot } = await escenario();
    await crearTarea({ ot_id: ot.id });
    const inactivo = await crearUsuario({ activo: false });
    const antes = await conteos();
    const tAntes = await filaTicket(ticket.id);
    for (const responsable_id of [999999, inactivo.id]) {
      for (const accion of ['en_curso', 'nueva_ot']) {
        const r = await agente.post(`/api/ots/${ot.id}/cerrar`).send({
          resolvio_ticket: false,
          resumen: 'x',
          siguiente: { accion, responsable_id },
        });
        expect(r.status).toBe(400);
        expect(r.body.error.detalles).toHaveProperty('responsable_id');
      }
    }
    expect(await conteos()).toEqual(antes);
    expect((await filaOt(ot.id)).etapa).toBe('en_ejecucion');
    expect(await filaTicket(ticket.id)).toEqual(tAntes);
  });

  it('un fallo tardío (después de escribir OT, mensajes y eventos) deshace todo y no publica eventos', async () => {
    const { agente } = await como();
    const { ticket, ot } = await escenario();
    await crearTarea({ ot_id: ot.id });
    const nuevo = await crearUsuario();
    const antes = await conteos();
    const tAntes = await filaTicket(ticket.id);
    const publicados = vi.fn();
    eventosDominio.on('ot.cerrada', publicados);
    await dataSourceOwner.initialize();
    try {
      // falla al registrar `convertido_en_ot` en el ticket, ya con la OT cerrada y la nueva insertada
      await dataSourceOwner.query(`
        CREATE FUNCTION falla_cierre_prueba() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'fallo de prueba'; END $$;
        CREATE TRIGGER falla_cierre_prueba BEFORE INSERT ON evento
          FOR EACH ROW WHEN (NEW.accion = 'convertido_en_ot') EXECUTE FUNCTION falla_cierre_prueba();`);
      const r = await agente.post(`/api/ots/${ot.id}/cerrar`).send({
        resolvio_ticket: false,
        resumen: 'Quedó pendiente',
        siguiente: { accion: 'nueva_ot', responsable_id: nuevo.id },
      });
      expect(r.status).toBe(500);
    } finally {
      await dataSourceOwner.query(
        `DROP TRIGGER IF EXISTS falla_cierre_prueba ON evento; DROP FUNCTION IF EXISTS falla_cierre_prueba();`,
      );
      await dataSourceOwner.destroy();
      eventosDominio.off('ot.cerrada', publicados);
    }
    expect(publicados).not.toHaveBeenCalled();
    expect(await conteos()).toEqual(antes);
    expect(await filaOt(ot.id)).toMatchObject({ etapa: 'en_ejecucion', cerrada_en: null });
    expect(await filaTicket(ticket.id)).toEqual(tAntes);
    // el número de la nueva OT tampoco se consumió
    const ok = await agente.post(`/api/ots/${ot.id}/cerrar`).send({
      resolvio_ticket: false,
      resumen: 'Ahora sí',
      siguiente: { accion: 'nueva_ot', responsable_id: nuevo.id },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.ticket_origen.otras_ots_abiertas[0].codigo).toBe('OT-0200');
  });

  it('desde una etapa distinta de en_ejecucion → 409 TRANSICION_INVALIDA; ticket cerrado → 409; inexistente → 404', async () => {
    const { agente } = await como();
    const t = await crearTicket({ estado: 'en_curso' });
    const aprobada = await crearOt(t.id, { etapa: 'aprobada' });
    const r = await agente
      .post(`/api/ots/${aprobada.id}/cerrar`)
      .send({ resolvio_ticket: true, resumen: 'x' });
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TRANSICION_INVALIDA');
    expect(r.body.error.detalles).toMatchObject({
      entidad: 'ot',
      desde: 'aprobada',
      hasta: 'cerrada',
    });
    const cerrada = await crearOt(t.id, { etapa: 'cerrada' });
    expect(
      (
        await agente
          .post(`/api/ots/${cerrada.id}/cerrar`)
          .send({ resolvio_ticket: true, resumen: 'x' })
      ).status,
    ).toBe(409);

    const tc = await crearTicket({ estado: 'en_curso' });
    const enEjec = await crearOt(tc.id, { etapa: 'en_ejecucion' });
    await dataSource.query(
      `UPDATE ticket SET estado = 'resuelto', cerrado_en = now() WHERE id = $1`,
      [tc.id],
    );
    const c = await agente
      .post(`/api/ots/${enEjec.id}/cerrar`)
      .send({ resolvio_ticket: true, resumen: 'x' });
    expect(c.status).toBe(409);
    expect(c.body.error.codigo).toBe('TICKET_CERRADO');

    expect(
      (await agente.post('/api/ots/999999/cerrar').send({ resolvio_ticket: true, resumen: 'x' }))
        .status,
    ).toBe(404);
  });
});

describe('cerrar OT: usa efectosCierreOt (F3-T8)', () => {
  it('el estado final del ticket sale de efectosCierreOt; el `datos` del evento de la OT no', async () => {
    const { agente } = await como();
    const { ticket, ot } = await escenario({ ticketEstado: 'nuevo' });
    efectosMock.cambio = { ticket_estado_final: 'en_curso', estado_facturacion_final: 'no_aplica' };
    // resolvio_ticket: true con un efecto que dice "en_curso": el servicio sigue lo que dicen los efectos
    const r = await agente
      .post(`/api/ots/${ot.id}/cerrar`)
      .send({ resolvio_ticket: true, resumen: 'Listo' });
    expect(r.status).toBe(200);
    expect(r.body.estado_facturacion).toBe('no_aplica');
    expect((await filaTicket(ticket.id)).estado).toBe('en_curso');
    const [ev] = await eventos('ot', ot.id);
    expect(ev.datos).toEqual({ resolvio_ticket: true, siguiente: null });
  });
});
