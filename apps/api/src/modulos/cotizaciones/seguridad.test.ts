import { Writable } from 'node:stream';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  crearArchivoPendiente,
  crearCliente,
  crearContacto,
  crearCotizacion,
  crearOt,
  crearPlantilla,
  crearTarea,
  crearTicket,
  crearUsuario,
  fijarTarifas,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { crearLogger, logger as loggerGlobal } from '../../config/logger.js';
import { metadatosRutas } from '../../core/http/openapi.js';

const app = () => crearApp({ comprobarBd: async () => true });

type Rol = 'admin' | 'coordinacion' | 'tecnico' | 'lectura';

async function como(rol: Rol = 'tecnico') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

// OT facturable de un cliente externo con un contacto.
async function otFacturable(
  etapa: 'borrador' | 'cotizada' | 'aprobada' | 'en_ejecucion' = 'borrador',
) {
  const cliente = await crearCliente();
  const contacto = await crearContacto(cliente.id);
  const ticket = await crearTicket({ cliente_id: cliente.id });
  const ot = await crearOt(ticket.id, { tipo: 'facturable', etapa, cliente_id: cliente.id });
  return { cliente, contacto, ticket, ot };
}

type Agente = Awaited<ReturnType<typeof ingresarComo>>['agente'];

// Descarga binaria: supertest no acumula tipos desconocidos si no se le indica cómo.
const binario = (agente: Agente, url: string) =>
  agente
    .get(url)
    .buffer(true)
    .parse((res, cb) => {
      const trozos: Buffer[] = [];
      res.on('data', (t: Buffer) => trozos.push(t));
      res.on('end', () => cb(null, Buffer.concat(trozos)));
    });

// Prueba 16
describe('prueba 16: descargas .xlsx y .pdf', () => {
  it.each([
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['pdf', 'application/pdf'],
  ] as const)(
    '%s: 200 attachment, auditoría exportacion, evento en la OT y sin archivos nuevos',
    async (formato, tipo) => {
      const { agente, usuario } = await como('lectura');
      const { ot, contacto } = await otFacturable('cotizada');
      const c = await crearCotizacion(ot.id, {
        estado: 'enviada',
        contacto_id: contacto.id,
        lineas: [{ cantidad: 3, precio_unitario: 38000 }],
      });
      const r = await binario(agente, `/api/cotizaciones/${c.id}/descargar.${formato}`);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain(tipo);
      expect(r.headers['content-disposition']).toBe(
        `attachment; filename="${c.codigo}_v1.${formato}"; filename*=UTF-8''${c.codigo}_v1.${formato}`,
      );
      expect(r.headers['cache-control']).toBe('no-store');
      expect(Number(r.headers['content-length'])).toBe((r.body as Buffer).length);
      expect((r.body as Buffer).length).toBeGreaterThan(1024);
      if (formato === 'pdf') expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      else expect((r.body as Buffer).subarray(0, 2).toString()).toBe('PK');

      const aud = await dataSource.query(
        `SELECT usuario_id, detalle FROM auditoria WHERE accion = 'exportacion'`,
      );
      expect(aud).toHaveLength(1);
      expect(aud[0].usuario_id).toBe(usuario.id);
      expect(aud[0].detalle).toEqual({
        tipo: formato,
        entidad: 'cotizacion',
        entidad_id: c.id,
        ot_id: ot.id,
      });
      const evs = await dataSource.query(
        `SELECT autor_id, datos FROM evento WHERE entidad = 'ot' AND entidad_id = $1 AND accion = 'cotizacion_descargada'`,
        [String(ot.id)],
      );
      expect(evs).toHaveLength(1);
      expect(evs[0].datos).toEqual({
        cotizacion_id: c.id,
        codigo: c.codigo,
        version: 1,
        formato,
      });
      expect(await dataSource.query(`SELECT 1 FROM archivo`)).toHaveLength(0);
    },
  );

  it('un borrador lleva -BORRADOR en el nombre; id inexistente → 404 sin rastro', async () => {
    const { agente } = await como('tecnico');
    const { ot } = await otFacturable();
    const c = await crearCotizacion(ot.id, { lineas: [{ cantidad: 1, precio_unitario: 1000 }] });
    const r = await binario(agente, `/api/cotizaciones/${c.id}/descargar.xlsx`);
    expect(r.headers['content-disposition']).toContain(`filename="${c.codigo}_v1-BORRADOR.xlsx"`);
    const antes = await dataSource.query(
      `SELECT count(*)::int AS n FROM auditoria WHERE accion = 'exportacion'`,
    );
    const nf = await agente.get('/api/cotizaciones/999999/descargar.pdf');
    expect(nf.status).toBe(404);
    expect(nf.headers['x-request-id']).toBeDefined();
    const despues = await dataSource.query(
      `SELECT count(*)::int AS n FROM auditoria WHERE accion = 'exportacion'`,
    );
    expect(despues).toEqual(antes);
  });

  it('la nota interna no sale en la planilla descargada', async () => {
    const { agente } = await como('tecnico');
    const { ot } = await otFacturable();
    const c = await crearCotizacion(ot.id, {
      nota_interna: 'NOTA-INTERNA-SECRETA-XYZ',
      lineas: [{ cantidad: 1, precio_unitario: 1000 }],
    });
    const r = await binario(agente, `/api/cotizaciones/${c.id}/descargar.xlsx`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body as Buffer as unknown as ExcelJS.Buffer);
    const textos: string[] = [];
    wb.getWorksheet('Cotización')!.eachRow((f) =>
      f.eachCell((cel) => textos.push(String(cel.value))),
    );
    expect(textos.join('\n')).not.toContain('NOTA-INTERNA-SECRETA-XYZ');
  });
});

// Prueba 18 (la parte de los documentos; el guardado literal está en cotizaciones.test.ts)
describe('prueba 18: texto con HTML o fórmulas en los documentos', () => {
  it('descripción con HTML o "=…" se guarda literal y en el .xlsx queda como texto', async () => {
    const { agente } = await como('tecnico');
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id);
    const html = '<img src=x onerror=alert(1)>';
    const put = await agente.put(`/api/cotizaciones/${c.id}`).send({
      contacto_id: contacto.id,
      fecha_emision: '2026-09-29',
      validez_dias: 30,
      moneda: 'CLP',
      valor_uf: null,
      aplica_iva: true,
      condiciones: '<b>Condiciones</b>',
      nota_interna: null,
      lineas: [html, '=HYPERLINK("http://x")'].map((descripcion) => ({
        tipo: 'servicio',
        descripcion,
        cantidad: 1,
        unidad: 'un',
        precio_unitario: 1000,
        descuento_pct: 0,
      })),
    });
    expect(put.status).toBe(200);
    expect(put.body.lineas[0].descripcion).toBe(html);
    const r = await binario(agente, `/api/cotizaciones/${c.id}/descargar.xlsx`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body as Buffer as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('Cotización')!;
    for (const [i, texto] of [html, '=HYPERLINK("http://x")'].entries()) {
      expect(ws.getCell(`C${10 + i}`).type).toBe(ExcelJS.ValueType.String);
      expect(ws.getCell(`C${10 + i}`).value).toBe(texto);
    }
  });
});

const LINEAS_DISENO = [
  {
    tipo: 'mano_de_obra',
    descripcion: 'Diagnóstico',
    cantidad: 3,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
  },
  {
    tipo: 'mano_de_obra',
    descripcion: 'Carga de CAF',
    cantidad: 4,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
  },
  {
    tipo: 'mano_de_obra',
    descripcion: 'Paso a producción',
    cantidad: 2,
    unidad: 'h',
    precio_unitario: 45000,
    descuento_pct: 0,
  },
  {
    tipo: 'mano_de_obra',
    descripcion: 'Capacitación',
    cantidad: 1,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
  },
  {
    tipo: 'servicio',
    descripcion: 'Soporte remoto',
    cantidad: 1,
    unidad: 'un',
    precio_unitario: 90000,
    descuento_pct: 10,
  },
];

const hoy = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

const entrada = (contacto_id: number | null) => ({
  contacto_id,
  fecha_emision: hoy(),
  validez_dias: 30,
  moneda: 'CLP',
  valor_uf: null,
  aplica_iva: true,
  condiciones: null,
  nota_interna: null,
  lineas: LINEAS_DISENO,
});

// ---- Mapa de las 22 pruebas de seguridad de la fase 4 (spec §10) ----
// 1, 2, 16, 18 (documentos), 19, 22 y la parte de configuración de la 6: este archivo.
// 3, 4, 5 (editar), 6 (montos), 7 (contacto en PUT), 15, 18 (guardado literal), 21: cotizaciones.test.ts
// 5 (DELETE enviada), 7 (enviar), 8 a 14, 20: cotizaciones-flujo.test.ts
// 17: integraciones/xlsx/cotizacion.xlsx.test.ts e integraciones/pdf/cotizacion.pdf.test.ts

// Prueba 1
describe('prueba 1: sin sesión', () => {
  it('401 en cada ruta de cotizaciones, también en las descargas y la creación desde la OT', async () => {
    const a = app(); // registra las rutas en el catálogo
    const rutas = metadatosRutas().filter(
      (r) => r.path.includes('/cotizaciones') && !r.path.startsWith('/api/config/'),
    );
    expect(rutas.length).toBeGreaterThanOrEqual(11);
    for (const r of rutas) {
      const res = await request(a)
        [r.metodo](r.path.replace(/:\w+/g, '1'))
        .set('X-Requested-With', 'Zydesk')
        .send({});
      expect(res.status, `${r.metodo} ${r.path}`).toBe(401);
    }
  });
});

// Prueba 2
describe('prueba 2: roles', () => {
  // Una OT con su cotización por acción, para que no interfieran entre sí.
  async function preparar() {
    const cliente = await crearCliente();
    const contacto = await crearContacto(cliente.id);
    const ticket = await crearTicket({ cliente_id: cliente.id });
    const ot = (etapa: 'borrador' | 'cotizada') =>
      crearOt(ticket.id, { tipo: 'facturable', etapa, cliente_id: cliente.id });
    const lineas = [{ cantidad: 1, precio_unitario: 1000 }];
    const sinCotizar = await ot('borrador');
    const paraEditar = await ot('borrador');
    const borradorEditar = await crearCotizacion(paraEditar.id, {
      contacto_id: contacto.id,
      lineas,
    });
    const paraImportar = await ot('borrador');
    const borradorImportar = await crearCotizacion(paraImportar.id, { contacto_id: contacto.id });
    await crearTarea({ ot_id: paraImportar.id }, { horas_estimadas: 2 });
    const paraPlantilla = await ot('borrador');
    const borradorPlantilla = await crearCotizacion(paraPlantilla.id, {
      contacto_id: contacto.id,
    });
    const paraEnviar = await ot('borrador');
    const borradorEnviar = await crearCotizacion(paraEnviar.id, {
      contacto_id: contacto.id,
      lineas,
    });
    const paraDuplicar = await ot('cotizada');
    const enviada = await crearCotizacion(paraDuplicar.id, {
      estado: 'enviada',
      contacto_id: contacto.id,
      lineas,
    });
    const paraEliminar = await ot('borrador');
    const borradorEliminar = await crearCotizacion(paraEliminar.id, { contacto_id: contacto.id });
    const paraAprobar = await ot('cotizada');
    await crearCotizacion(paraAprobar.id, { estado: 'enviada', contacto_id: contacto.id, lineas });
    const plantilla = await crearPlantilla({ lineas: [{ unidad: 'un', precio_unitario: 100 }] });
    return {
      contacto,
      sinCotizar,
      borradorEditar,
      borradorImportar,
      borradorPlantilla,
      borradorEnviar,
      enviada,
      borradorEliminar,
      paraAprobar,
      plantilla,
    };
  }
  type Datos = Awaited<ReturnType<typeof preparar>>;

  const TARIFAS = {
    hora_normal: { moneda: 'CLP', valor: 38000 },
    hora_extendida: null,
    hora_urgencia: null,
    traslado_km: null,
    costo_interno: null,
    iva_pct: 19,
    validez_dias_defecto: 30,
    condiciones_defecto: null,
  };
  const PLANTILLA = { nombre: 'Nueva', descripcion: null, condiciones: null, lineas: [] };

  const MUTACIONES: {
    nombre: string;
    permiso: 'editar' | 'aprobar' | 'config';
    enviar: (a: Agente, d: Datos, u: { id: number }) => Promise<{ status: number }>;
    ok: number;
  }[] = [
    {
      nombre: 'POST ots/:id/cotizaciones',
      permiso: 'editar',
      ok: 201,
      enviar: (a, d) => a.post(`/api/ots/${d.sinCotizar.id}/cotizaciones`),
    },
    {
      nombre: 'PUT cotización',
      permiso: 'editar',
      ok: 200,
      enviar: (a, d) =>
        a.put(`/api/cotizaciones/${d.borradorEditar.id}`).send(entrada(d.contacto.id)),
    },
    {
      nombre: 'importar-horas',
      permiso: 'editar',
      ok: 200,
      enviar: (a, d) =>
        a.post(`/api/cotizaciones/${d.borradorImportar.id}/importar-horas`).send({}),
    },
    {
      nombre: 'aplicar-plantilla',
      permiso: 'editar',
      ok: 200,
      enviar: (a, d) =>
        a
          .post(`/api/cotizaciones/${d.borradorPlantilla.id}/aplicar-plantilla`)
          .send({ plantilla_id: d.plantilla.id }),
    },
    {
      nombre: 'enviar',
      permiso: 'editar',
      ok: 200,
      enviar: (a, d) => a.post(`/api/cotizaciones/${d.borradorEnviar.id}/enviar`),
    },
    {
      nombre: 'duplicar',
      permiso: 'editar',
      ok: 201,
      enviar: (a, d) => a.post(`/api/cotizaciones/${d.enviada.id}/duplicar`),
    },
    {
      nombre: 'DELETE cotización',
      permiso: 'editar',
      ok: 204,
      enviar: (a, d) => a.delete(`/api/cotizaciones/${d.borradorEliminar.id}`),
    },
    {
      nombre: 'PUT aprobacion',
      permiso: 'aprobar',
      ok: 200,
      enviar: async (a, d, u) =>
        a.put(`/api/ots/${d.paraAprobar.id}/aprobacion`).send({
          contacto_id: d.contacto.id,
          fecha: '2026-09-28',
          forma: 'correo',
          archivo_id: (await crearArchivoPendiente(u.id)).id,
        }),
    },
    {
      nombre: 'PUT config/tarifas',
      permiso: 'config',
      ok: 200,
      enviar: (a) => a.put('/api/config/tarifas').send(TARIFAS),
    },
    {
      nombre: 'POST config/plantillas',
      permiso: 'config',
      ok: 201,
      enviar: (a) =>
        a.post('/api/config/plantillas-cotizacion').send({ ...PLANTILLA, nombre: 'Nueva' }),
    },
    {
      nombre: 'PUT config/plantillas/:id',
      permiso: 'config',
      ok: 200,
      enviar: (a, d) =>
        a
          .put(`/api/config/plantillas-cotizacion/${d.plantilla.id}`)
          .send({ ...PLANTILLA, nombre: 'Editada' }),
    },
    {
      nombre: 'PATCH config/plantillas/:id/activo',
      permiso: 'config',
      ok: 200,
      enviar: (a, d) =>
        a
          .patch(`/api/config/plantillas-cotizacion/${d.plantilla.id}/activo`)
          .send({ activo: false }),
    },
  ];

  it.each([
    ['tecnico', ['editar']],
    ['coordinacion', ['editar', 'aprobar']],
    ['admin', ['editar', 'aprobar', 'config']],
  ] as const)('%s: permitido en lo suyo y 403 en lo demás', async (rol, permitidos) => {
    await fijarTarifas({ hora_normal: { moneda: 'CLP', valor: 38000 } });
    const { agente, usuario } = await como(rol);
    const datos = await preparar();
    for (const m of MUTACIONES) {
      const r = await m.enviar(agente, datos, usuario);
      const esperado = (permitidos as readonly string[]).includes(m.permiso) ? m.ok : 403;
      expect(r.status, `${rol} ${m.nombre}`).toBe(esperado);
    }
  });

  it('lectura: 200 al leer lista, detalle, descargas, tarifas y plantillas; 403 en toda mutación', async () => {
    const { agente, usuario } = await como('lectura');
    const datos = await preparar();
    for (const url of [
      '/api/cotizaciones',
      `/api/cotizaciones/${datos.enviada.id}`,
      `/api/cotizaciones/${datos.enviada.id}/descargar.xlsx`,
      `/api/cotizaciones/${datos.enviada.id}/descargar.pdf`,
      '/api/config/tarifas',
      '/api/config/plantillas-cotizacion',
    ]) {
      expect((await agente.get(url)).status, url).toBe(200);
    }
    const conteos = () =>
      dataSource.query(
        `SELECT (SELECT count(*) FROM cotizacion)::int AS cotizaciones,
                (SELECT count(*) FROM linea_cotizacion)::int AS lineas,
                (SELECT count(*) FROM plantilla_cotizacion)::int AS plantillas`,
      );
    const antes = await conteos();
    for (const m of MUTACIONES) {
      expect((await m.enviar(agente, datos, usuario)).status, m.nombre).toBe(403);
    }
    expect(await conteos()).toEqual(antes);
  });
});

// Prueba 6 (la parte de la configuración)
describe('prueba 6: el IVA de la configuración es un snapshot', () => {
  it('PUT /api/config/tarifas con iva_pct 0 no cambia la cotización existente; una nueva nace con 0', async () => {
    await fijarTarifas({ hora_normal: { moneda: 'CLP', valor: 38000 } });
    const admin = await como('admin');
    const a = await otFacturable();
    const b = await otFacturable();
    const existente = (await admin.agente.post(`/api/ots/${a.ot.id}/cotizaciones`)).body;
    const guardada = await admin.agente
      .put(`/api/cotizaciones/${existente.id}`)
      .send(entrada(a.contacto.id));
    expect(guardada.body.totales.total).toBe(565250);
    const tarifas = await admin.agente.get('/api/config/tarifas');
    const cambio = await admin.agente
      .put('/api/config/tarifas')
      .send({ ...tarifas.body, iva_pct: 0 });
    expect(cambio.status).toBe(200);
    const igual = await admin.agente
      .put(`/api/cotizaciones/${existente.id}`)
      .send(entrada(a.contacto.id));
    expect(igual.body).toMatchObject({ iva_pct: 19, totales: { iva: 90250, total: 565250 } });
    const nueva = await admin.agente.post(`/api/ots/${b.ot.id}/cotizaciones`);
    expect(nueva.body.iva_pct).toBe(0);
    // un técnico no cambia las tarifas
    const tec = await como('tecnico');
    const prohibido = await tec.agente
      .put('/api/config/tarifas')
      .send({ ...tarifas.body, hora_normal: 1 });
    expect(prohibido.status).toBe(403);
  });
});

// Prueba 19
describe('prueba 19: logs sin contenido ni montos', () => {
  it('PUT y enviar no dejan descripción, condiciones, nota interna, neto ni total en el logger', async () => {
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
      const usuario = await crearUsuario({ rol: 'tecnico' });
      const { agente } = await ingresarComo(
        crearApp({ comprobarBd: async () => true, logger }),
        usuario,
      );
      const { ot, contacto } = await otFacturable();
      const c = await crearCotizacion(ot.id);
      const put = await agente.put(`/api/cotizaciones/${c.id}`).send({
        ...entrada(contacto.id),
        condiciones: 'CONDICIONES-SECRETAS-111',
        nota_interna: 'NOTA-SECRETA-222',
        lineas: [
          {
            tipo: 'servicio',
            descripcion: 'DESCRIPCION-SECRETA-333',
            cantidad: 1,
            unidad: 'un',
            precio_unitario: 123457,
            descuento_pct: 0,
          },
        ],
      });
      expect(put.status).toBe(200);
      const env = await agente.post(`/api/cotizaciones/${c.id}/enviar`);
      expect(env.status).toBe(200);
      await agente.get(`/api/cotizaciones/${c.id}/descargar.pdf`);
    } finally {
      for (const e of espias) e.mockRestore();
    }
    const todo = [...lineas, ...global].join('\n');
    expect(lineas.length).toBeGreaterThan(0);
    for (const secreto of [
      'CONDICIONES-SECRETAS-111',
      'NOTA-SECRETA-222',
      'DESCRIPCION-SECRETA-333',
      '123457',
      '146914', // total con IVA
    ]) {
      expect(todo).not.toContain(secreto);
    }
    for (const clave of ['"neto"', '"total"', '"descripcion"', '"condiciones"', '"nota_interna"']) {
      expect(todo).not.toContain(clave);
    }
  });
});

// Prueba 22
describe('prueba 22: X-Request-Id', () => {
  it('presente en un 409 y coincide con evento.req_id de un enviar', async () => {
    const { agente } = await como('tecnico');
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id, {
      contacto_id: contacto.id,
      lineas: [{ cantidad: 1, precio_unitario: 1000 }],
    });
    const conflicto = await agente.post(`/api/ots/${ot.id}/cotizaciones`);
    expect(conflicto.status).toBe(409);
    expect(conflicto.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const ok = await agente.post(`/api/cotizaciones/${c.id}/enviar`);
    expect(ok.status).toBe(200);
    const evs = await dataSource.query(
      `SELECT req_id FROM evento WHERE entidad = 'ot' AND entidad_id = $1`,
      [String(ot.id)],
    );
    expect(evs.length).toBeGreaterThan(0);
    for (const e of evs) expect(e.req_id).toBe(ok.headers['x-request-id']);
  });
});

// F4-SEC-01
describe('totales fuera de rango de numeric(14,2)', () => {
  it('PUT con cantidad y precio máximos: 400 VALIDACION con detalles.lineas, no 500', async () => {
    const { agente } = await como('tecnico');
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id);
    const r = await agente.put(`/api/cotizaciones/${c.id}`).send({
      ...entrada(contacto.id),
      lineas: [
        {
          tipo: 'servicio',
          descripcion: 'x',
          cantidad: 999999,
          unidad: 'un',
          precio_unitario: 999999999,
          descuento_pct: 0,
        },
      ],
    });
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('VALIDACION');
    expect(r.body.error.detalles.lineas).toBeDefined();
  });
});

// F4-SEC-02
describe('enviar con un contacto que ya no es del cliente de la OT', () => {
  it('400 VALIDACION contacto_id; la cotización sigue en borrador y la OT sin contacto', async () => {
    const { agente } = await como('coordinacion');
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id, {
      contacto_id: contacto.id,
      lineas: [{ cantidad: 1, precio_unitario: 1000 }],
    });
    const otro = await crearCliente();
    const cambio = await agente.patch(`/api/ots/${ot.id}`).send({ cliente_id: otro.id });
    expect(cambio.status).toBe(200);
    const r = await agente.post(`/api/cotizaciones/${c.id}/enviar`);
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('VALIDACION');
    expect(r.body.error.detalles.contacto_id).toBeDefined();
    const [cot] = await dataSource.query(`SELECT estado FROM cotizacion WHERE id = $1`, [c.id]);
    expect(cot.estado).toBe('borrador');
    const [o] = await dataSource.query(`SELECT contacto_id FROM ot WHERE id = $1`, [ot.id]);
    expect(o.contacto_id).toBeNull();
  });
});
