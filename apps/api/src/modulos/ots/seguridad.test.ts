import { Writable } from 'node:stream';
import { tienePermiso, type Rol } from '@zydesk/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  crearArchivoPendiente,
  crearCliente,
  crearContacto,
  crearMensaje,
  crearOt,
  crearTarea,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { logger as loggerGlobal, crearLogger } from '../../config/logger.js';
import { metadatosRutas } from '../../core/http/openapi.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: Rol) {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

// ---- Prueba 1: sin sesión → 401 en todas las rutas de OT (el genérico de la Fase 1 hace el resto) ----

describe('prueba 1: sin sesión', () => {
  it('401 en cada ruta de OT, de aprobación y de copia al ticket', async () => {
    const a = app(); // registra las rutas en el catálogo
    const rutas = metadatosRutas().filter(
      (r) =>
        r.path.includes('/ots') ||
        r.path.includes('convertir-en-ot') ||
        r.path.includes('copiar-al-ticket'),
    );
    expect(rutas.length).toBeGreaterThanOrEqual(17);
    for (const r of rutas) {
      const res = await request(a)
        [r.metodo](r.path.replace(/:\w+/g, '1'))
        .set('X-Requested-With', 'Zydesk')
        .send({});
      expect(res.status, `${r.metodo} ${r.path}`).toBe(401);
    }
  });
});

// ---- Prueba 2: roles ----

// Datos frescos por rol: una OT para cada acción para que no interfieran entre sí.
async function preparar(usuario: { id: number }) {
  const cliente = await crearCliente();
  const contacto = await crearContacto(cliente.id);
  const ticket = await crearTicket({ estado: 'en_curso', cliente_id: cliente.id });
  const ot = (etapa: 'borrador' | 'cotizada' | 'en_ejecucion' | 'cerrada', tipo = 'facturable') =>
    crearOt(ticket.id, { tipo: tipo as 'facturable' | 'interna', etapa, cliente_id: cliente.id });
  const trabajo = await ot('borrador');
  const paraCotizar = await ot('cotizada');
  const interna = await ot('borrador', 'interna');
  const paraCancelar = await ot('borrador');
  const paraFacturar = await ot('cerrada');
  // `cerrar` con resolvio_ticket: true exige que no haya otra OT abierta: va en un ticket aparte
  const ticketCierre = await crearTicket({ estado: 'en_curso' });
  const paraCerrar = await crearOt(ticketCierre.id, { etapa: 'en_ejecucion' });
  const mensaje = await crearMensaje({ ot_id: trabajo.id }, { autor_id: usuario.id });
  return {
    ticket,
    contacto,
    trabajo,
    paraCotizar,
    interna,
    paraCancelar,
    paraFacturar,
    paraCerrar,
    mensaje,
  };
}

type Agente = Awaited<ReturnType<typeof ingresarComo>>['agente'];
type Datos = Awaited<ReturnType<typeof preparar>>;

const MUTACIONES: {
  nombre: string;
  permiso: 'editar' | 'especial';
  enviar: (a: Agente, d: Datos, u: { id: number }) => Promise<{ status: number }>;
}[] = [
  {
    nombre: 'convertir-en-ot',
    permiso: 'editar',
    enviar: (a, d) =>
      a.post(`/api/tickets/${d.ticket.id}/convertir-en-ot`).send({ tipo: 'interna' }),
  },
  {
    nombre: 'PATCH',
    permiso: 'editar',
    enviar: (a, d) => a.patch(`/api/ots/${d.trabajo.id}`).send({ titulo: 'Nuevo' }),
  },
  {
    nombre: 'cambiar-etapa',
    permiso: 'editar',
    enviar: (a, d) => a.post(`/api/ots/${d.trabajo.id}/cambiar-etapa`).send({ etapa: 'cotizada' }),
  },
  {
    nombre: 'POST tareas',
    permiso: 'editar',
    enviar: (a, d) => a.post(`/api/ots/${d.trabajo.id}/tareas`).send({ titulo: 'Tarea' }),
  },
  {
    nombre: 'POST mensajes',
    permiso: 'editar',
    enviar: (a, d) =>
      a.post(`/api/ots/${d.trabajo.id}/mensajes`).send({ tipo: 'seguimiento', texto: 'Avance' }),
  },
  {
    nombre: 'POST archivos',
    permiso: 'editar',
    enviar: async (a, d, u) =>
      a
        .post(`/api/ots/${d.trabajo.id}/archivos`)
        .send({ archivo_ids: [(await crearArchivoPendiente(u.id)).id] }),
  },
  {
    nombre: 'copiar-al-ticket',
    permiso: 'editar',
    enviar: (a, d) => a.post(`/api/mensajes/${d.mensaje.id}/copiar-al-ticket`).send(),
  },
  {
    nombre: 'aprobar',
    permiso: 'especial',
    enviar: (a, d) => a.post(`/api/ots/${d.interna.id}/aprobar`).send({}),
  },
  {
    nombre: 'PUT aprobacion',
    permiso: 'especial',
    enviar: async (a, d, u) =>
      a.put(`/api/ots/${d.paraCotizar.id}/aprobacion`).send({
        contacto_id: d.contacto.id,
        fecha: '2026-09-28',
        forma: 'correo',
        archivo_id: (await crearArchivoPendiente(u.id)).id,
      }),
  },
  {
    nombre: 'cerrar',
    permiso: 'especial',
    enviar: (a, d) =>
      a
        .post(`/api/ots/${d.paraCerrar.id}/cerrar`)
        .send({ resolvio_ticket: true, resumen: 'Listo' }),
  },
  {
    nombre: 'cancelar',
    permiso: 'especial',
    enviar: (a, d) =>
      a.post(`/api/ots/${d.paraCancelar.id}/cancelar`).send({ motivo: 'Ya no se hará' }),
  },
  {
    nombre: 'facturar',
    permiso: 'especial',
    enviar: (a, d) => a.post(`/api/ots/${d.paraFacturar.id}/facturar`).send({ n_factura: 'F-1' }),
  },
];

const OK: Record<string, number> = {
  'convertir-en-ot': 201,
  'POST tareas': 201,
  'POST mensajes': 201,
  'copiar-al-ticket': 201,
};

describe('prueba 2: roles', () => {
  it.each(['tecnico', 'coordinacion', 'admin'] as const)(
    '%s: 200/201 en lo que su rol permite y 403 en lo demás',
    async (rol) => {
      const { agente, usuario } = await como(rol);
      const datos = await preparar(usuario);
      const puedeEspecial = tienePermiso(rol, 'ots.cerrar');
      for (const m of MUTACIONES) {
        const r = await m.enviar(agente, datos, usuario);
        const esperado = m.permiso === 'especial' && !puedeEspecial ? 403 : (OK[m.nombre] ?? 200);
        expect(r.status, `${rol} ${m.nombre}`).toBe(esperado);
      }
      // Lo bloqueado por rol no dejó rastro: las OT de cada acción siguen como estaban
      if (!puedeEspecial) {
        const etapas = await dataSource.query(
          `SELECT id, etapa FROM ot WHERE id = ANY($1::int[])`,
          [[datos.interna.id, datos.paraCotizar.id, datos.paraCancelar.id, datos.paraCerrar.id]],
        );
        const por = Object.fromEntries(
          etapas.map((e: { id: number; etapa: string }) => [e.id, e.etapa]),
        );
        expect(por[datos.interna.id]).toBe('borrador');
        expect(por[datos.paraCotizar.id]).toBe('cotizada');
        expect(por[datos.paraCancelar.id]).toBe('borrador');
        expect(por[datos.paraCerrar.id]).toBe('en_ejecucion');
        const [f] = await dataSource.query(`SELECT estado_facturacion FROM ot WHERE id = $1`, [
          datos.paraFacturar.id,
        ]);
        expect(f.estado_facturacion).toBe('por_facturar');
      }
    },
  );

  it('lectura: 403 en toda mutación y 200 al leer OT, actividad (con notas internas) y archivos', async () => {
    const { agente, usuario } = await como('lectura');
    const datos = await preparar(usuario);
    const antes = await dataSource.query(
      `SELECT (SELECT count(*) FROM ot)::int AS ots, (SELECT count(*) FROM mensaje)::int AS mensajes,
              (SELECT count(*) FROM tarea)::int AS tareas, (SELECT count(*) FROM evento)::int AS eventos`,
    );
    for (const m of MUTACIONES) {
      const r = (await m.enviar(agente, datos, usuario)) as {
        status: number;
        body?: { error?: { codigo?: string } };
      };
      expect(r.status, `lectura ${m.nombre}`).toBe(403);
      expect(r.body?.error?.codigo).toBe('SIN_PERMISO');
    }
    expect(
      await dataSource.query(
        `SELECT (SELECT count(*) FROM ot)::int AS ots, (SELECT count(*) FROM mensaje)::int AS mensajes,
                (SELECT count(*) FROM tarea)::int AS tareas, (SELECT count(*) FROM evento)::int AS eventos`,
      ),
    ).toEqual(antes);

    const autor = await crearUsuario();
    await crearMensaje(
      { ot_id: datos.trabajo.id },
      { autor_id: autor.id, tipo: 'nota_interna', texto: 'Nota interna' },
    );
    await crearTarea({ ot_id: datos.trabajo.id });
    const archivo = await crearArchivoPendiente(autor.id, { tipo_mime: 'text/csv' });
    await dataSource.query(`UPDATE archivo SET entidad = 'ot', entidad_id = $2 WHERE id = $1`, [
      archivo.id,
      datos.trabajo.id,
    ]);
    expect((await agente.get('/api/ots')).status).toBe(200);
    expect((await agente.get(`/api/ots/${datos.trabajo.id}`)).status).toBe(200);
    const act = await agente.get(`/api/ots/${datos.trabajo.id}/actividad`);
    expect(act.status).toBe(200);
    expect(
      act.body.items.some(
        (i: { tipo: string; mensaje?: { tipo: string } }) => i.mensaje?.tipo === 'nota_interna',
      ),
    ).toBe(true);
    expect((await agente.get(`/api/archivos/${archivo.id}`)).status).toBe(200);
  });
});

// ---- Prueba 13 (parte de descarga): ADR 0021, solo se audita el `attachment` ----

describe('prueba 13: descarga de archivos de OT', () => {
  it('un csv de OT se audita como attachment; un PDF o una imagen inline no', async () => {
    const { agente, usuario } = await como('tecnico');
    const t = await crearTicket();
    const ot = await crearOt(t.id);
    const csv = await crearArchivoPendiente(usuario.id, { tipo_mime: 'text/csv', nombre: 'a.csv' });
    const pdf = await crearArchivoPendiente(usuario.id, {
      tipo_mime: 'application/pdf',
      nombre: 'a.pdf',
    });
    const png = await crearArchivoPendiente(usuario.id, {
      tipo_mime: 'image/png',
      nombre: 'a.png',
    });
    const r = await agente
      .post(`/api/ots/${ot.id}/archivos`)
      .send({ archivo_ids: [csv.id, pdf.id, png.id] });
    expect(r.status).toBe(200);

    const lector = await como('lectura');
    const dPdf = await lector.agente.get(`/api/archivos/${pdf.id}`);
    expect(dPdf.status).toBe(200);
    expect(dPdf.headers['content-disposition']).toMatch(/^inline/);
    expect((await lector.agente.get(`/api/archivos/${png.id}`)).status).toBe(200);
    expect(
      await dataSource.query(`SELECT 1 FROM auditoria WHERE accion = 'descarga_archivo'`),
    ).toEqual([]);

    const dCsv = await lector.agente.get(`/api/archivos/${csv.id}`);
    expect(dCsv.status).toBe(200);
    const aud = await dataSource.query(
      `SELECT usuario_id, detalle FROM auditoria WHERE accion = 'descarga_archivo'`,
    );
    expect(aud).toHaveLength(1);
    expect(aud[0].usuario_id).toBe(lector.usuario.id);
    expect(aud[0].detalle).toMatchObject({ archivo_id: csv.id, entidad: 'ot', entidad_id: ot.id });
  });
});

// ---- Prueba 15: texto literal ----

describe('prueba 15: el texto se guarda y se devuelve literal', () => {
  it('un resumen con HTML no se transforma en la OT ni en el ticket', async () => {
    const { agente } = await como('coordinacion');
    const peligro = '<img src=x onerror=alert(1)>';
    const t = await crearTicket({ estado: 'en_curso' });
    const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
    const r = await agente
      .post(`/api/ots/${ot.id}/cerrar`)
      .send({ resolvio_ticket: true, resumen: peligro });
    expect(r.status).toBe(200);
    expect(r.body.resumen_cierre).toBe(peligro);
    expect((await agente.get(`/api/ots/${ot.id}`)).body.resumen_cierre).toBe(peligro);
    const [fila] = await dataSource.query(`SELECT resumen_cierre FROM ot WHERE id = $1`, [ot.id]);
    expect(fila.resumen_cierre).toBe(peligro);

    const deOt = await agente.get(`/api/ots/${ot.id}/mensajes`);
    expect(deOt.body.map((m: { texto: string }) => m.texto)).toEqual([peligro]);
    const deTicket = await agente.get(`/api/tickets/${t.id}/mensajes`);
    expect(deTicket.body.map((m: { texto: string }) => m.texto)).toEqual([peligro]);
    const act = await agente.get(`/api/tickets/${t.id}/actividad`);
    const cerrada = act.body.items.find(
      (i: { tipo: string; evento?: { accion: string } }) => i.evento?.accion === 'ot_cerrada',
    );
    expect(cerrada.evento.datos.resumen).toBe(peligro);
  });
});

// ---- Prueba 16: logs solo con ids ----

describe('prueba 16: logs sin contenido', () => {
  it('cerrar una OT y crear un seguimiento no dejan resumen, texto ni nombre de archivo en el logger', async () => {
    const lineas: string[] = [];
    const destino = new Writable({
      write(chunk, _enc, cb) {
        lineas.push(...String(chunk).split('\n').filter(Boolean));
        cb();
      },
    });
    const logger = crearLogger({
      nivel: 'debug',
      entorno: 'test',
      version: '0.0.0',
      bonito: false,
      destino,
    });
    // el logger global lo usan servicios, oyentes de dominio y errores: también se intercepta
    const global: string[] = [];
    const espias = (['trace', 'debug', 'info', 'warn', 'error'] as const).map((nivel) =>
      vi.spyOn(loggerGlobal, nivel).mockImplementation(((...args: unknown[]) => {
        global.push(JSON.stringify(args));
      }) as never),
    );
    try {
      const usuario = await crearUsuario({ rol: 'coordinacion' });
      const { agente } = await ingresarComo(
        crearApp({ comprobarBd: async () => true, logger }),
        usuario,
      );
      const t = await crearTicket({ estado: 'en_curso' });
      const ot = await crearOt(t.id, { etapa: 'en_ejecucion' });
      const archivo = await crearArchivoPendiente(usuario.id, {
        nombre: 'nombre-secreto-xyz.csv',
        tipo_mime: 'text/csv',
      });
      const s = await agente.post(`/api/ots/${ot.id}/mensajes`).send({
        tipo: 'seguimiento',
        texto: 'TEXTO-SECRETO-456',
        archivo_ids: [archivo.id],
        copiar_al_ticket: true,
      });
      expect(s.status).toBe(201);
      const c = await agente
        .post(`/api/ots/${ot.id}/cerrar`)
        .send({ resolvio_ticket: true, resumen: 'RESUMEN-SECRETO-123' });
      expect(c.status).toBe(200);
      await agente.get(`/api/archivos/${archivo.id}`);
    } finally {
      for (const e of espias) e.mockRestore();
    }
    const todo = [...lineas, ...global].join('\n');
    expect(lineas.length).toBeGreaterThan(0);
    for (const secreto of ['RESUMEN-SECRETO-123', 'TEXTO-SECRETO-456', 'nombre-secreto-xyz']) {
      expect(todo).not.toContain(secreto);
    }
    // el oyente de dominio sí dejó su línea, solo con ids
    expect(global.some((l) => l.includes('evento de dominio') && l.includes('ot.cerrada'))).toBe(
      true,
    );
  });
});

// ---- Prueba 18: X-Request-Id ----

describe('prueba 18: X-Request-Id', () => {
  it('presente en un 409 y coincide con evento.req_id de un cierre', async () => {
    const { agente } = await como('coordinacion');
    const t = await crearTicket({ estado: 'en_curso' });
    const aprobada = await crearOt(t.id, { etapa: 'aprobada' });
    const conflicto = await agente
      .post(`/api/ots/${aprobada.id}/cerrar`)
      .send({ resolvio_ticket: true, resumen: 'x' });
    expect(conflicto.status).toBe(409);
    expect(conflicto.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const ejec = await crearOt((await crearTicket({ estado: 'en_curso' })).id, {
      etapa: 'en_ejecucion',
    });
    const ok = await agente
      .post(`/api/ots/${ejec.id}/cerrar`)
      .send({ resolvio_ticket: true, resumen: 'Listo' });
    expect(ok.status).toBe(200);
    const evs = await dataSource.query(
      `SELECT req_id FROM evento WHERE entidad = 'ot' AND entidad_id = $1`,
      [String(ejec.id)],
    );
    expect(evs.length).toBeGreaterThan(0);
    for (const e of evs) expect(e.req_id).toBe(ok.headers['x-request-id']);
  });
});
