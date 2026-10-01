import { ETAPAS_OT, TIPOS_OT } from '@zydesk/shared';
import { describe, expect, it } from 'vitest';
import {
  crearArchivoPendiente,
  crearBolsa,
  crearCliente,
  crearContacto,
  crearMensaje,
  crearOt,
  crearTarea,
  crearTicket,
  crearUsuario,
} from '../../test/fabricas.js';
import { dataSource } from '../config/db.js';
import { Archivo } from '../modulos/archivos/archivo.entity.js';

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
const FK = '23503';

describe('fábricas de la Fase 3', () => {
  it('crearOt numera desde 9000, arma el código y respeta los CHECK en cada etapa y tipo', async () => {
    const ticket = await crearTicket();
    let esperado = 9000;
    for (const tipo of TIPOS_OT) {
      for (const etapa of ETAPAS_OT) {
        const ot = await crearOt(ticket.id, { tipo, etapa });
        expect([ot.numero, ot.codigo]).toEqual([esperado, `OT-${esperado}`]);
        esperado++;
        expect(ot.tipo).toBe(tipo);
        expect(ot.etapa).toBe(etapa);
        expect(ot.ticket_id).toBe(ticket.id);
        if (tipo === 'interna') expect(ot.estado_facturacion).toBe('no_aplica');
        if (etapa === 'cerrada') {
          expect(ot.resumen_cierre).not.toBeNull();
          expect(ot.resolvio_ticket).toBe(true);
          expect(ot.cerrada_en).not.toBeNull();
          if (tipo === 'facturable') expect(ot.estado_facturacion).toBe('por_facturar');
        }
        if (etapa === 'cancelada') {
          expect(ot.motivo_cancelacion).not.toBeNull();
          expect(ot.cancelada_en).not.toBeNull();
          expect(ot.estado_facturacion).toBe('no_aplica');
        }
        if (tipo === 'facturable' && !['cerrada', 'cancelada'].includes(etapa)) {
          expect(ot.estado_facturacion).toBe('pendiente');
        }
      }
    }
  });

  it('crearOt facturada rellena n_factura y facturada_en; acepta numero, vínculos y resolvio_ticket', async () => {
    const ticket = await crearTicket();
    const cliente = await crearCliente();
    const usuario = await crearUsuario();
    const bolsa = await crearBolsa(cliente.id);
    const ot = await crearOt(ticket.id, {
      etapa: 'cerrada',
      estado_facturacion: 'facturada',
      resolvio_ticket: false,
      numero: 9500,
      cliente_id: cliente.id,
      contrato_id: bolsa.id,
      responsable_tecnico_id: usuario.id,
      aprobador_id: usuario.id,
      titulo: 'Instalación',
    });
    expect(ot.codigo).toBe('OT-9500');
    expect(ot.n_factura).not.toBeNull();
    expect(ot.facturada_en).not.toBeNull();
    expect(ot.resolvio_ticket).toBe(false);
    expect(ot.titulo).toBe('Instalación');
    const siguiente = await crearOt(ticket.id);
    expect(siguiente.numero).toBe(9501);
  });

  it('CHECK de la tabla ot', async () => {
    const ticket = await crearTicket();
    const q = (sql: string, args: unknown[] = []) => dataSource.query(sql, args);
    const base = `INSERT INTO ot (numero, codigo, ticket_id, tipo, etapa, titulo, estado_facturacion`;
    const n = (i: number) => [9800 + i, `OT-${9800 + i}`, ticket.id];
    // interna con facturación distinta de no_aplica
    expect(
      await codigoError(q(`${base}) VALUES ($1,$2,$3,'interna','borrador','t','pendiente')`, n(1))),
    ).toBe(CHECK);
    // cerrada sin resumen
    expect(
      await codigoError(q(`${base}) VALUES ($1,$2,$3,'interna','cerrada','t','no_aplica')`, n(2))),
    ).toBe(CHECK);
    // cancelada sin motivo
    expect(
      await codigoError(
        q(`${base}) VALUES ($1,$2,$3,'interna','cancelada','t','no_aplica')`, n(3)),
      ),
    ).toBe(CHECK);
    // facturada sin n_factura
    expect(
      await codigoError(
        q(`${base}) VALUES ($1,$2,$3,'facturable','borrador','t','facturada')`, n(4)),
      ),
    ).toBe(CHECK);
    // término antes de inicio
    expect(
      await codigoError(
        q(
          `INSERT INTO ot (numero, codigo, ticket_id, tipo, etapa, titulo, estado_facturacion, inicio, termino)
           VALUES ($1,$2,$3,'interna','borrador','t','no_aplica','2026-10-10','2026-10-09')`,
          n(5),
        ),
      ),
    ).toBe(CHECK);
    // tipo y etapa fuera del catálogo
    expect(
      await codigoError(q(`${base}) VALUES ($1,$2,$3,'otro','borrador','t','no_aplica')`, n(6))),
    ).toBe(CHECK);
    expect(
      await codigoError(
        q(`${base}) VALUES ($1,$2,$3,'interna','facturada','t','no_aplica')`, n(7)),
      ),
    ).toBe(CHECK);
    // numero y codigo únicos
    await crearOt(ticket.id, { numero: 9900 });
    expect(await codigoError(crearOt(ticket.id, { numero: 9900 }))).toBe(UNICO);
  });

  it('ot.ticket_id es RESTRICT: no se borra un ticket con OT', async () => {
    const ticket = await crearTicket();
    await crearOt(ticket.id);
    expect(
      await codigoError(dataSource.query(`DELETE FROM ticket WHERE id = $1`, [ticket.id])),
    ).toBe(FK);
  });

  it('tarea: exactamente un destino; horas solo en tareas de OT', async () => {
    const ticket = await crearTicket();
    const ot = await crearOt(ticket.id);
    const deTicket = await crearTarea(ticket.id);
    const deOt = await crearTarea({ ot_id: ot.id }, { horas_estimadas: 3, horas_reales: 1.5 });
    const segunda = await crearTarea({ ot_id: ot.id });
    expect([deTicket.ticket_id, deTicket.ot_id]).toEqual([ticket.id, null]);
    expect([deOt.ticket_id, deOt.ot_id, deOt.orden, segunda.orden]).toEqual([null, ot.id, 1, 2]);
    const [fila]: { horas_estimadas: number; horas_reales: number }[] = await dataSource.query(
      `SELECT horas_estimadas::float8 AS horas_estimadas, horas_reales::float8 AS horas_reales FROM tarea WHERE id = $1`,
      [deOt.id],
    );
    expect(fila).toEqual({ horas_estimadas: 3, horas_reales: 1.5 });

    const q = (sql: string, args: unknown[] = []) => dataSource.query(sql, args);
    expect(await codigoError(q(`INSERT INTO tarea (titulo, orden) VALUES ('x', 99)`))).toBe(CHECK);
    expect(
      await codigoError(
        q(`INSERT INTO tarea (ticket_id, ot_id, titulo, orden) VALUES ($1, $2, 'x', 99)`, [
          ticket.id,
          ot.id,
        ]),
      ),
    ).toBe(CHECK);
    expect(
      await codigoError(
        q(`INSERT INTO tarea (ticket_id, titulo, orden, horas_estimadas) VALUES ($1, 'x', 99, 1)`, [
          ticket.id,
        ]),
      ),
    ).toBe(CHECK);
    expect(
      await codigoError(
        q(`INSERT INTO tarea (ot_id, titulo, orden, horas_reales) VALUES ($1, 'x', 99, -1)`, [
          ot.id,
        ]),
      ),
    ).toBe(CHECK);
  });

  it('tarea de OT se borra en cascada con la OT', async () => {
    const ot = await crearOt((await crearTicket()).id);
    await crearTarea({ ot_id: ot.id });
    await dataSource.query(`DELETE FROM ot WHERE id = $1`, [ot.id]);
    const [{ n }] = await dataSource.query(`SELECT count(*)::int AS n FROM tarea`);
    expect(n).toBe(0);
  });

  it('mensaje: exactamente un destino; una sola copia por origen', async () => {
    const u = await crearUsuario();
    const ticket = await crearTicket();
    const ot = await crearOt(ticket.id);
    const deTicket = await crearMensaje(ticket.id, { autor_id: u.id });
    const deOt = await crearMensaje({ ot_id: ot.id }, { autor_id: u.id, horas: 1.5 });
    expect([deTicket.ticket_id, deTicket.ot_id]).toEqual([ticket.id, null]);
    expect([deOt.ticket_id, deOt.ot_id]).toEqual([null, ot.id]);

    const q = (sql: string, args: unknown[]) => dataSource.query(sql, args);
    expect(
      await codigoError(q(`INSERT INTO mensaje (tipo, texto) VALUES ('seguimiento', 'x')`, [])),
    ).toBe(CHECK);
    expect(
      await codigoError(
        q(
          `INSERT INTO mensaje (ticket_id, ot_id, tipo, texto) VALUES ($1, $2, 'seguimiento', 'x')`,
          [ticket.id, ot.id],
        ),
      ),
    ).toBe(CHECK);

    const copiar = () =>
      q(
        `INSERT INTO mensaje (ticket_id, tipo, texto, copiado_desde_id) VALUES ($1, 'seguimiento', 'x', $2)`,
        [ticket.id, deOt.id],
      );
    await copiar();
    expect(await codigoError(copiar())).toBe(UNICO);
  });

  it('registro_horas: ot_id y ticket_id no pueden ir juntos', async () => {
    const u = await crearUsuario();
    const ticket = await crearTicket();
    const ot = await crearOt(ticket.id);
    const insertar = (t: number | null, o: number | null) =>
      dataSource.query(
        `INSERT INTO registro_horas (usuario_id, fecha, ticket_id, ot_id, horas) VALUES ($1, '2026-10-01', $2, $3, 1)`,
        [u.id, t, o],
      );
    await insertar(ticket.id, null);
    await insertar(null, ot.id);
    await insertar(null, null);
    expect(await codigoError(insertar(ticket.id, ot.id))).toBe(CHECK);
  });

  it('archivo: entidad acepta ot y rechaza otras', async () => {
    const u = await crearUsuario();
    const ot = await crearOt((await crearTicket()).id);
    const f = await crearArchivoPendiente(u.id);
    await dataSource.manager.update(Archivo, { id: f.id }, { entidad: 'ot', entidad_id: ot.id });
    expect((await dataSource.manager.findOneByOrFail(Archivo, { id: f.id })).entidad).toBe('ot');
    expect(
      await codigoError(
        dataSource.query(`UPDATE archivo SET entidad = 'cliente' WHERE id = $1`, [f.id]),
      ),
    ).toBe(CHECK);
  });

  it('aprobacion_cliente: una por OT, con respaldo obligatorio', async () => {
    const u = await crearUsuario();
    const cliente = await crearCliente();
    const contacto = await crearContacto(cliente.id, { aprueba_cotizaciones: true });
    expect(contacto.aprueba_cotizaciones).toBe(true);
    const ot = await crearOt((await crearTicket()).id, {
      etapa: 'aprobada',
      cliente_id: cliente.id,
    });
    const respaldo = await crearArchivoPendiente(u.id);
    const insertar = (archivo_id: number | null, forma = 'correo') =>
      dataSource.query(
        `INSERT INTO aprobacion_cliente (ot_id, contacto_id, fecha, forma, archivo_id) VALUES ($1, $2, '2026-10-01', $3, $4)`,
        [ot.id, contacto.id, forma, archivo_id],
      );
    expect(await codigoError(insertar(null))).toBe('23502');
    expect(await codigoError(insertar(respaldo.id, 'verbal'))).toBe(CHECK);
    await insertar(respaldo.id);
    expect(await codigoError(insertar(respaldo.id))).toBe(UNICO);
    // el respaldo no se puede borrar mientras esté referenciado
    expect(
      await codigoError(dataSource.query(`DELETE FROM archivo WHERE id = $1`, [respaldo.id])),
    ).toBe(FK);
  });

  it('crearBolsa y crearContacto', async () => {
    const cliente = await crearCliente();
    const bolsa = await crearBolsa(cliente.id, { vigente_desde: '2026-01-01', horas_mes: 10 });
    expect([bolsa.cliente_id, bolsa.horas_mes, bolsa.vigente_desde, bolsa.vigente_hasta]).toEqual([
      cliente.id,
      10,
      '2026-01-01',
      null,
    ]);
    const contacto = await crearContacto(cliente.id);
    expect([contacto.cliente_id, contacto.aprueba_cotizaciones, contacto.activo]).toEqual([
      cliente.id,
      false,
      true,
    ]);
  });
});
