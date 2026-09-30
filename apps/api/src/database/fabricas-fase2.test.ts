import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  archivoDePrueba,
  crearArchivoPendiente,
  crearCategoria,
  crearCliente,
  crearMensaje,
  crearTarea,
  crearTicket,
  crearUsuario,
  directorioArchivosTest,
} from '../../test/fabricas.js';
import { dataSource } from '../config/db.js';
import { Archivo } from '../modulos/archivos/archivo.entity.js';
import { RegistroHoras } from '../modulos/horas/registro-horas.entity.js';
import { Mencion } from '../modulos/mensajes/mencion.entity.js';
import { Mensaje } from '../modulos/mensajes/mensaje.entity.js';
import { CorreoAdjunto } from '../modulos/tickets/correo-adjunto.entity.js';
import { TicketResponsable } from '../modulos/tickets/ticket-responsable.entity.js';
import { TicketSeguidor } from '../modulos/tickets/ticket-seguidor.entity.js';

async function codigoError(consulta: Promise<unknown>): Promise<string | undefined> {
  try {
    await consulta;
  } catch (err) {
    return (err as { driverError?: { code?: string } }).driverError?.code;
  }
  return undefined;
}

describe('fábricas de la Fase 2', () => {
  it('crearTicket numera desde 5000, arma el código y asigna responsables', async () => {
    const principal = await crearUsuario();
    const otro = await crearUsuario();
    const cliente = await crearCliente();
    const categoria = await crearCategoria();
    const t1 = await crearTicket({
      cliente_id: cliente.id,
      categoria_id: categoria.id,
      principal_id: principal.id,
      otros_ids: [otro.id],
      prioridad: 'alta',
      creado_por: principal.id,
    });
    const t2 = await crearTicket();
    expect([t1.numero, t1.codigo]).toEqual([5000, 'TK-5000']);
    expect([t2.numero, t2.codigo]).toEqual([5001, 'TK-5001']);
    expect(t1.estado).toBe('nuevo');
    expect(t1.prioridad).toBe('alta');
    expect(t1.cerrado_en).toBeNull();

    const filas = await dataSource.manager.find(TicketResponsable, {
      where: { ticket_id: t1.id },
      order: { usuario_id: 'ASC' },
    });
    expect(filas.map((f) => [f.usuario_id, f.principal])).toEqual([
      [principal.id, true],
      [otro.id, false],
    ]);
  });

  it('crearTicket satisface los CHECK de cada estado', async () => {
    const espera = await crearTicket({ estado: 'en_espera' });
    expect(espera.espera_de).toBe('cliente');
    const resuelto = await crearTicket({ estado: 'resuelto' });
    expect(resuelto.cerrado_en).toBeInstanceOf(Date);
    const descartado = await crearTicket({ estado: 'descartado' });
    expect(descartado.motivo_cierre).not.toBeNull();
    const duplicado = await crearTicket({ estado: 'duplicado' });
    expect(duplicado.duplicado_de_id).not.toBeNull();
    const viejo = new Date('2026-01-01T12:00:00Z');
    const archivado = await crearTicket({
      estado: 'resuelto',
      cerrado_en: viejo,
      archivado_en: viejo,
    });
    expect(archivado.cerrado_en).toEqual(viejo);
  });

  it('la tabla ticket rechaza estados incoherentes y numero/codigo repetidos', async () => {
    const t = await crearTicket();
    const insertar = (extra: string, valores: string) =>
      dataSource.query(
        `INSERT INTO ticket (numero, codigo, asunto, origen, prioridad, estado ${extra})
         VALUES (9001, 'TK-9001', 'x', 'externo', 'media', ${valores})`,
      );
    expect(await codigoError(insertar('', `'en_espera'`))).toBe('23514');
    expect(await codigoError(insertar('', `'descartado'`))).toBe('23514');
    expect(await codigoError(insertar('', `'duplicado'`))).toBe('23514');
    expect(await codigoError(insertar('', `'resuelto'`))).toBe('23514');
    expect(await codigoError(insertar(', cerrado_en', `'nuevo', now()`))).toBe('23514');
    await expect(crearTicket({ numero: t.numero })).rejects.toThrow();
  });

  it('un ticket solo admite un responsable principal', async () => {
    const a = await crearUsuario();
    const b = await crearUsuario();
    const t = await crearTicket({ principal_id: a.id });
    expect(
      await codigoError(
        dataSource.manager.save(TicketResponsable, {
          ticket_id: t.id,
          usuario_id: b.id,
          principal: true,
        }),
      ),
    ).toBe('23505');
  });

  it('crearMensaje y crearTarea devuelven filas válidas (numeric como number, orden correlativo)', async () => {
    const u = await crearUsuario();
    const t = await crearTicket();
    const m = await crearMensaje(t.id, { autor_id: u.id, tipo: 'nota_interna', horas: 1.5 });
    const leido = await dataSource.manager.findOneByOrFail(Mensaje, { id: m.id });
    expect(leido.tipo).toBe('nota_interna');
    expect(leido.horas).toBe(1.5);
    expect(await codigoError(crearMensaje(t.id, { autor_id: u.id, horas: 0 }))).toBe('23514');

    const t1 = await crearTarea(t.id, { responsable_id: u.id, fecha: '2026-10-05' });
    const t2 = await crearTarea(t.id, { hecha: true });
    expect([t1.orden, t2.orden]).toEqual([1, 2]);
    expect(t2.hecha_en).toBeInstanceOf(Date);
    expect(t1.fecha).toBe('2026-10-05');
  });

  it('registro_horas, mencion, seguidor y correo_adjunto se relacionan con el ticket', async () => {
    const u = await crearUsuario();
    const t = await crearTicket();
    const m = await crearMensaje(t.id, { autor_id: u.id, horas: 2 });
    await dataSource.manager.save(Mencion, { mensaje_id: m.id, usuario_id: u.id });
    await dataSource.manager.save(TicketSeguidor, { ticket_id: t.id, usuario_id: u.id });
    const horas = await dataSource.manager.save(RegistroHoras, {
      usuario_id: u.id,
      fecha: '2026-09-30',
      ticket_id: t.id,
      mensaje_id: m.id,
      horas: 2.25,
      fuera_de_horario: false,
      descripcion: null,
    });
    expect((await dataSource.manager.findOneByOrFail(RegistroHoras, { id: horas.id })).horas).toBe(
      2.25,
    );
    expect(
      await codigoError(
        dataSource.manager.save(RegistroHoras, {
          usuario_id: u.id,
          fecha: '2026-09-30',
          horas: 25,
          fuera_de_horario: false,
        }),
      ),
    ).toBe('23514');

    const original = await crearArchivoPendiente(u.id, {
      nombre: 'correo.eml',
      tipo_mime: 'message/rfc822',
    });
    const correo = await dataSource.manager.save(CorreoAdjunto, {
      ticket_id: t.id,
      archivo_id: original.id,
      origen: 'eml',
      de: 'Paula Herrera <pherrera@ejemplo.test>',
      para: null,
      fecha: new Date('2026-09-29T19:45:00Z'),
      asunto: 'Error',
      cuerpo: 'Hola',
    });
    // un solo correo por ticket
    expect(
      await codigoError(
        dataSource.manager.save(CorreoAdjunto, { ticket_id: t.id, origen: 'texto', cuerpo: '' }),
      ),
    ).toBe('23505');

    // adjunto interno del correo; al borrar el correo (ON DELETE SET NULL) el archivo queda sin origen
    const adjunto = await crearArchivoPendiente(u.id);
    await dataSource.query(
      `UPDATE archivo SET entidad = 'ticket', entidad_id = $1, origen_correo_id = $2, mensaje_id = $3 WHERE id = $4`,
      [t.id, correo.id, m.id, adjunto.id],
    );
    await dataSource.query(`DELETE FROM correo_adjunto WHERE id = $1`, [correo.id]);
    const despues = await dataSource.manager.findOneByOrFail(Archivo, { id: adjunto.id });
    expect(despues.origen_correo_id).toBeNull();
    // borrar el mensaje borra sus archivos asociados (ON DELETE CASCADE)
    await dataSource.query(`DELETE FROM mensaje WHERE id = $1`, [m.id]);
    expect(await dataSource.manager.countBy(Archivo, { id: adjunto.id })).toBe(0);
  });

  it('crearArchivoPendiente escribe el archivo en disco y deja la fila pendiente', async () => {
    const u = await crearUsuario();
    const contenido = archivoDePrueba('foto.jpg');
    const a = await crearArchivoPendiente(u.id, {
      nombre: 'foto.jpg',
      tipo_mime: 'image/jpeg',
      contenido,
    });
    expect(a.entidad).toBeNull();
    expect(a.categoria).toBe('foto');
    expect(a.tamano).toBe(contenido.length);
    expect(a.clave).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect(fs.readFileSync(path.join(directorioArchivosTest(), a.clave))).toEqual(contenido);
  });
});

describe('fixtures de correo y archivos', () => {
  it.each([
    ['correo.eml', 'From: Paula Herrera <pherrera@ejemplo.test>'],
    ['correo.eml', 'Subject: Error al emitir facturas desde el ERP'],
    ['correo.eml', 'filename="captura.png"'],
    ['correo-html.eml', 'Content-Type: text/html'],
    ['correo.txt', 'Asunto: Error al emitir facturas desde el ERP'],
    ['correo.txt', 'Enviado:'],
  ])('%s contiene %s', (nombre, texto) => {
    expect(archivoDePrueba(nombre).toString('utf8')).toContain(texto);
  });

  it('las cabeceras binarias son las esperadas', () => {
    expect(archivoDePrueba('foto.jpg').subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(archivoDePrueba('doc.pdf').subarray(0, 5).toString()).toBe('%PDF-');
    // "imagen" que en realidad es un ejecutable (cabecera MZ)
    expect(archivoDePrueba('no-es-imagen.png').subarray(0, 2).toString()).toBe('MZ');
  });

  // Pregunta abierta 1 de la spec: no hay un .msg real sin datos personales. Para activar este test, exporta
  // desde Outlook un correo de prueba (enviado a ti mismo, con un adjunto pequeño) como `correo.msg`, guárdalo en
  // `apps/api/test/fixtures/`, cambia `it.skip` por `it` y usa `leerMsg` (bloque 2C, F2-T4) para comprobar
  // remitente, asunto y adjunto.
  it.skip('correo.msg: lo leerá leerMsg (fixture pendiente)', () => {
    expect(archivoDePrueba('correo.msg').length).toBeGreaterThan(0);
  });
});
