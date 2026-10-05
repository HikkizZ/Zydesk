import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calcularCotizacion, enClp } from '@zydesk/shared';
import { describe, expect, it } from 'vitest';
import {
  crearCliente,
  crearContacto,
  crearCotizacion,
  crearIndicadorUf,
  crearOt,
  crearPlantilla,
  crearRegistroHoras,
  crearTarifaCliente,
  crearTarea,
  crearTicket,
  crearUsuario,
  fijarTarifas,
  guardarTarifasGlobales,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { hoyEnSantiago } from '../../core/fechas.js';

// Fase 8b (bloque 8bD): snapshot de la UF, procedencia en el PUT y conversión de tarifas (spec §4, §5.2, §9, §10.3).

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura' = 'tecnico') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

async function otFacturable(
  opciones: {
    cliente?: Awaited<ReturnType<typeof crearCliente>>;
    etapa?: 'borrador' | 'cotizada';
  } = {},
) {
  const cliente = opciones.cliente ?? (await crearCliente());
  const contacto = await crearContacto(cliente.id);
  const ticket = await crearTicket({ cliente_id: cliente.id });
  const ot = await crearOt(ticket.id, {
    tipo: 'facturable',
    etapa: opciones.etapa ?? 'borrador',
    cliente_id: cliente.id,
  });
  return { cliente, contacto, ticket, ot };
}

type Agente = Awaited<ReturnType<typeof como>>['agente'];

const entrada = (contacto_id: number | null, extra: Record<string, unknown> = {}) => ({
  contacto_id,
  fecha_emision: hoyEnSantiago(),
  validez_dias: 30,
  moneda: 'CLP',
  valor_uf: null,
  aplica_iva: true,
  condiciones: null,
  nota_interna: null,
  lineas: [],
  ...extra,
});

interface FilaEvento {
  accion: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  datos: Record<string, unknown>;
}

const eventosOt = (id: number): Promise<FilaEvento[]> =>
  dataSource.query(
    `SELECT accion, campo, valor_anterior, valor_nuevo, datos FROM evento
      WHERE entidad = 'ot' AND entidad_id = $1 ORDER BY id`,
    [String(id)],
  );

const crear = async (agente: Agente, ot_id: number) => {
  const r = await agente.post(`/api/ots/${ot_id}/cotizaciones`);
  expect(r.status).toBe(201);
  return r.body;
};

const importar = (agente: Agente, id: number, origen = 'estimadas') =>
  agente.post(`/api/cotizaciones/${id}/importar-horas`).send({ origen });

const precios = (lineas: { precio_unitario: number }[]) => lineas.map((l) => l.precio_unitario);

describe('escenario de fábricas (spec 8b §10.3)', () => {
  it('snapshot al crear, conversión UF → CLP, misma moneda, CLP → UF, procedencia y CLP sin valor', async () => {
    await fijarTarifas({
      hora_normal: { moneda: 'CLP', valor: 38000 },
      hora_extendida: { moneda: 'CLP', valor: 45000 },
    });
    await crearIndicadorUf();
    const { agente, usuario } = await como();
    const austral = await crearCliente({ nombre: 'Austral' });
    await crearTarifaCliente(austral.id, 'hora_normal', { moneda: 'UF', valor: 0.8 });
    const { ot, contacto } = await otFacturable({ cliente: austral });
    await crearTarea({ ot_id: ot.id }, { titulo: 'Diagnóstico', horas_estimadas: 3 });
    await crearTarea({ ot_id: ot.id }, { titulo: 'Instalación', horas_estimadas: 4 });

    const c = await crear(agente, ot.id);
    expect(c).toMatchObject({
      moneda: 'CLP',
      valor_uf: 41098.15,
      valor_uf_fecha: hoyEnSantiago(),
      valor_uf_fuente: 'semilla',
    });

    // 0,8 UF × 41.098,15 = 32.878,52 → 32.879 por hora
    const r1 = await importar(agente, c.id);
    expect(r1.status).toBe(200);
    expect(precios(r1.body.lineas)).toEqual([32879, 32879]);
    expect(r1.body.lineas.map((l: { total: number }) => l.total)).toEqual([98637, 131516]);
    expect(r1.body.totales).toMatchObject({ neto: 230153, iva: 43729, total: 273882 });
    expect(r1.body.neto_clp).toBe(230153);
    const evs = (await eventosOt(ot.id)).filter((e) => e.accion === 'cotizacion_lineas_agregadas');
    expect(evs[0]!.datos).toMatchObject({
      n: 2,
      origen: 'tareas',
      tarifa_moneda: 'UF',
      valor_uf: 41098.15,
    });

    // a UF con el mismo valor: la procedencia se conserva
    await agente
      .put(`/api/cotizaciones/${c.id}`)
      .send(entrada(contacto.id, { moneda: 'UF', valor_uf: 41098.15 }));
    const trasPut = await agente.get(`/api/cotizaciones/${c.id}`);
    expect(trasPut.body).toMatchObject({
      moneda: 'UF',
      valor_uf: 41098.15,
      valor_uf_fecha: hoyEnSantiago(),
      valor_uf_fuente: 'semilla',
      lineas: [],
    });

    // tarifa del cliente en UF, misma moneda: sin redondeo adicional
    const r2 = await importar(agente, c.id);
    expect(precios(r2.body.lineas)).toEqual([0.8, 0.8]);
    expect(r2.body.lineas.map((l: { total: number }) => l.total)).toEqual([2.4, 3.2]);
    expect(r2.body.totales).toMatchObject({ neto: 5.6, iva: 1.06, total: 6.66 });
    expect(r2.body.neto_clp).toBe(230150);
    expect(r2.body.total_clp).toBe(273714);
    const evs2 = (await eventosOt(ot.id)).filter((e) => e.accion === 'cotizacion_lineas_agregadas');
    expect(evs2[1]!.datos).toMatchObject({ tarifa_moneda: 'UF' });
    expect(evs2[1]!.datos).not.toHaveProperty('valor_uf');

    // CLP → UF con la tarifa global (cliente sin tarifas)
    const otro = await otFacturable();
    await crearTarea({ ot_id: otro.ot.id }, { titulo: 'Diagnóstico', horas_estimadas: 3 });
    await crearTarea({ ot_id: otro.ot.id }, { titulo: 'Instalación', horas_estimadas: 4 });
    const c2 = await crear(agente, otro.ot.id);
    await agente
      .put(`/api/cotizaciones/${c2.id}`)
      .send(entrada(otro.contacto.id, { moneda: 'UF', valor_uf: 41098.15 }));
    const r3 = await importar(agente, c2.id);
    expect(precios(r3.body.lineas)).toEqual([0.92, 0.92]);
    expect(r3.body.lineas.map((l: { total: number }) => l.total)).toEqual([2.76, 3.68]);
    expect(r3.body.totales).toMatchObject({ neto: 6.44, iva: 1.22, total: 7.66 });
    const evs3 = (await eventosOt(otro.ot.id)).filter(
      (e) => e.accion === 'cotizacion_lineas_agregadas',
    );
    expect(evs3[0]!.datos).toMatchObject({ tarifa_moneda: 'CLP', valor_uf: 41098.15 });

    // valor escrito a mano: fuente manual, sin fecha, y un solo `cambio` de valor_uf con dos decimales
    const manual = await agente
      .put(`/api/cotizaciones/${c2.id}`)
      .send(entrada(otro.contacto.id, { moneda: 'UF', valor_uf: 41000, lineas: r3.body.lineas }));
    expect(manual.body).toMatchObject({
      valor_uf: 41000,
      valor_uf_fecha: null,
      valor_uf_fuente: 'manual',
    });
    const cambios = (await eventosOt(otro.ot.id)).filter(
      (e) => e.accion === 'cambio' && String(e.campo).startsWith('valor_uf'),
    );
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({
      campo: 'valor_uf',
      valor_anterior: '$41.098,15',
      valor_nuevo: '$41.000,00',
    });

    // CLP sin valor_uf: permitido; luego convertir una tarifa en UF → 400 { valor_uf } y nada cambia
    const clp = await agente
      .put(`/api/cotizaciones/${c.id}`)
      .send(entrada(contacto.id, { moneda: 'CLP', valor_uf: null }));
    expect(clp.status).toBe(200);
    expect(clp.body).toMatchObject({ valor_uf: null, valor_uf_fecha: null, valor_uf_fuente: null });
    const antes = (await agente.get(`/api/cotizaciones/${c.id}`)).body;
    const sinValor = await importar(agente, c.id);
    expect(sinValor.status).toBe(400);
    expect(sinValor.body.error.codigo).toBe('VALIDACION');
    expect(sinValor.body.error.detalles.valor_uf[0]).toContain('Hora normal');
    expect(sinValor.headers['x-request-id']).toBeTruthy();
    const despues = (await agente.get(`/api/cotizaciones/${c.id}`)).body;
    expect(despues.lineas).toHaveLength(0);
    expect(despues.actualizado_en).toBe(antes.actualizado_en);
    void usuario;
  });

  it('el caso del diseño en UF: 11,73 · 0,22 · 11,51 · 2,19 · 13,70 y neto_clp 473.040', () => {
    const lineas = [
      { cantidad: 3, precio_unitario: 0.92, descuento_pct: 0 },
      { cantidad: 4, precio_unitario: 0.92, descuento_pct: 0 },
      { cantidad: 2, precio_unitario: 1.09, descuento_pct: 0 },
      { cantidad: 1, precio_unitario: 0.92, descuento_pct: 0 },
      { cantidad: 1, precio_unitario: 2.19, descuento_pct: 10 },
    ];
    const r = calcularCotizacion(lineas, { moneda: 'UF', aplica_iva: true, iva_pct: 19 });
    expect(r).toMatchObject({
      subtotal: 11.73,
      descuentos: 0.22,
      neto: 11.51,
      iva: 2.19,
      total: 13.7,
    });
    expect(enClp(r.neto, 'UF', 41098.15)).toBe(473040);
  });
});

describe('PUT: procedencia de valor_uf sin confiar en el cliente (spec 8b §4.7 y §9.4)', () => {
  it('0, -1, 1e7 y 41098.155 → 400 VALIDACION { valor_uf }', async () => {
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id);
    for (const valor_uf of [0, -1, 1e7, 41098.155]) {
      const r = await agente
        .put(`/api/cotizaciones/${c.id}`)
        .send(entrada(contacto.id, { moneda: 'UF', valor_uf }));
      expect(r.status, String(valor_uf)).toBe(400);
      expect(r.body.error.codigo).toBe('VALIDACION');
      expect(r.body.error.detalles).toHaveProperty('valor_uf');
      expect(r.headers['x-request-id']).toBeTruthy();
    }
  });

  it('valor_uf_fecha y valor_uf_fuente del cuerpo se ignoran: un valor inventado queda manual', async () => {
    await crearIndicadorUf();
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    const c = await crearCotizacion(ot.id);
    const inventado = await agente.put(`/api/cotizaciones/${c.id}`).send(
      entrada(contacto.id, {
        valor_uf: 40123.45,
        valor_uf_fuente: 'boostr',
        valor_uf_fecha: '2026-01-01',
      }),
    );
    expect(inventado.status).toBe(200);
    expect(inventado.body).toMatchObject({
      valor_uf: 40123.45,
      valor_uf_fuente: 'manual',
      valor_uf_fecha: null,
    });
    // exactamente el valor de una fila conocida → su fecha y su fuente
    const conocido = await agente
      .put(`/api/cotizaciones/${c.id}`)
      .send(entrada(contacto.id, { valor_uf: 41098.15, valor_uf_fuente: 'manual' }));
    expect(conocido.body).toMatchObject({
      valor_uf: 41098.15,
      valor_uf_fuente: 'semilla',
      valor_uf_fecha: hoyEnSantiago(),
    });
  });

  it('valor_uf de 999999 con una tarifa de 99.999 UF: el total supera el máximo → 400 { lineas }', async () => {
    const { agente } = await como();
    const { ot, contacto, cliente } = await otFacturable();
    await crearTarifaCliente(cliente.id, 'hora_normal', { moneda: 'UF', valor: 99999 });
    await crearTarea({ ot_id: ot.id }, { horas_estimadas: 100 });
    const c = await crearCotizacion(ot.id, {
      contacto_id: contacto.id,
      valor_uf: 999999,
      valor_uf_fuente: 'manual',
    });
    const r = await importar(agente, c.id);
    expect(r.status).toBe(400);
    expect(r.body.error.detalles).toHaveProperty('lineas');
    expect((await agente.get(`/api/cotizaciones/${c.id}`)).body.lineas).toHaveLength(0);
  });
});

async function casoCLP() {
  const { agente } = await como();
  const { ot, contacto } = await otFacturable();
  const c = await crearCotizacion(ot.id, { contacto_id: contacto.id });
  const p = await crearPlantilla({
    lineas: [{ tipo: 'servicio', unidad: 'un', precio_unitario: 90000 }],
  });
  return agente.post(`/api/cotizaciones/${c.id}/aplicar-plantilla`).send({ plantilla_id: p.id });
}

describe('conversión de tarifas y plantillas (spec 8b §4.3 y §9.5)', () => {
  it('precio fijo de plantilla (CLP) en una cotización en UF → 2,19; con 10 % la línea da 1,97', async () => {
    await crearIndicadorUf();
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    const c = await crear(agente, ot.id);
    await agente
      .put(`/api/cotizaciones/${c.id}`)
      .send(entrada(contacto.id, { moneda: 'UF', valor_uf: 41098.15 }));
    const p = await crearPlantilla({
      lineas: [{ tipo: 'servicio', unidad: 'un', precio_unitario: 90000, descuento_pct: 10 }],
    });
    const r = await agente
      .post(`/api/cotizaciones/${c.id}/aplicar-plantilla`)
      .send({ plantilla_id: p.id });
    expect(r.status).toBe(200);
    expect(r.body.lineas[0]).toMatchObject({ precio_unitario: 2.19, total: 1.97 });
    const ev = (await eventosOt(ot.id)).filter((e) => e.accion === 'cotizacion_lineas_agregadas');
    expect(ev[0]!.datos).toMatchObject({
      origen: 'plantilla',
      tarifa_moneda: 'CLP',
      valor_uf: 41098.15,
    });
  });

  it('plantilla con tarifa por unidad convierte la del cliente (UF → CLP) y sin valor UF → 400', async () => {
    const { agente } = await como();
    const { ot, contacto, cliente } = await otFacturable();
    await crearTarifaCliente(cliente.id, 'hora_normal', { moneda: 'UF', valor: 0.8 });
    const c = await crearCotizacion(ot.id, { contacto_id: contacto.id });
    const p = await crearPlantilla({
      lineas: [{ unidad: 'h', cantidad: 3, precio_unitario: null }],
    });
    const sin = await agente
      .post(`/api/cotizaciones/${c.id}/aplicar-plantilla`)
      .send({ plantilla_id: p.id });
    expect(sin.status).toBe(400);
    expect(sin.body.error.detalles).toHaveProperty('valor_uf');
    await dataSource.query(
      `UPDATE cotizacion SET valor_uf = 41098.15, valor_uf_fuente = 'manual' WHERE id = $1`,
      [c.id],
    );
    const r = await agente
      .post(`/api/cotizaciones/${c.id}/aplicar-plantilla`)
      .send({ plantilla_id: p.id });
    expect(r.status).toBe(200);
    expect(precios(r.body.lineas)).toEqual([32879]);
    expect(r.body.lineas[0].total).toBe(98637);
  });

  it('precio fijo de plantilla en una cotización en CLP sin valor UF no necesita conversión', async () => {
    const r = await casoCLP();
    expect(r.status).toBe(200);
    expect(r.body.lineas[0]).toMatchObject({ precio_unitario: 90000 });
  });

  it('sin tarifa alguna → 409 TARIFA_FALTANTE antes que el 400; enviada → 409 antes de convertir', async () => {
    await fijarTarifas({ hora_normal: null, hora_extendida: null });
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    await crearTarea({ ot_id: ot.id }, { horas_estimadas: 2 });
    const c = await crearCotizacion(ot.id, { contacto_id: contacto.id });
    const r = await importar(agente, c.id);
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TARIFA_FALTANTE');

    const otra = await otFacturable({ etapa: 'cotizada' });
    await crearTarifaCliente(otra.cliente.id, 'hora_normal', { moneda: 'UF', valor: 0.8 });
    await crearTarea({ ot_id: otra.ot.id }, { horas_estimadas: 2 });
    const enviada = await crearCotizacion(otra.ot.id, { estado: 'enviada' });
    const e = await importar(agente, enviada.id);
    expect(e.status).toBe(409);
    expect(e.body.error.codigo).toBe('COTIZACION_NO_EDITABLE');
  });

  it('origen registradas: la tarifa extendida se convierte igual que la normal', async () => {
    await fijarTarifas({
      hora_normal: { moneda: 'CLP', valor: 38000 },
      hora_extendida: { moneda: 'UF', valor: 1 },
    });
    const { agente, usuario } = await como();
    const { ot, contacto } = await otFacturable();
    await crearRegistroHoras(usuario.id, { ot_id: ot.id, horas: 1 });
    await crearRegistroHoras(usuario.id, {
      ot_id: ot.id,
      horas: 2,
      fuera_de_horario: true,
      fecha: '2026-01-02',
    });
    const c = await crearCotizacion(ot.id, {
      contacto_id: contacto.id,
      valor_uf: 41098.15,
      valor_uf_fuente: 'manual',
    });
    const r = await importar(agente, c.id, 'registradas');
    expect(r.status).toBe(200);
    expect(precios(r.body.lineas).sort()).toEqual([38000, 41098]);
  });
});

describe('snapshot: la UF y las tarifas nuevas nunca alteran una cotización (spec 8b §9.6)', () => {
  it('un indicador posterior y un cambio de tarifa no cambian la v1; duplicar toma el del día', async () => {
    await crearIndicadorUf();
    const { agente } = await como();
    const { ot, contacto } = await otFacturable();
    const v1 = await crear(agente, ot.id);
    await agente.put(`/api/cotizaciones/${v1.id}`).send(
      entrada(contacto.id, {
        moneda: 'UF',
        valor_uf: 41098.15,
        lineas: [
          {
            tipo: 'servicio',
            descripcion: 'Proyecto',
            cantidad: 2,
            unidad: 'un',
            precio_unitario: 5,
            descuento_pct: 0,
          },
        ],
      }),
    );
    expect((await agente.post(`/api/cotizaciones/${v1.id}/enviar`)).status).toBe(200);
    const antesCot = (await agente.get(`/api/cotizaciones/${v1.id}`)).body;
    const antesOts = (await agente.get('/api/ots')).body;

    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await crearIndicadorUf({ fecha: manana, valor: 45000, fuente: 'boostr' });
    await guardarTarifasGlobales({ hora_normal: { moneda: 'UF', valor: 0.9 } });

    expect((await agente.get(`/api/cotizaciones/${v1.id}`)).body).toEqual(antesCot);
    expect((await agente.get('/api/ots')).body).toEqual(antesOts);

    const v2 = await agente.post(`/api/cotizaciones/${v1.id}/duplicar`);
    expect(v2.status).toBe(201);
    expect(v2.body).toMatchObject({
      version: 2,
      valor_uf: 45000,
      valor_uf_fecha: manana,
      valor_uf_fuente: 'boostr',
    });
    expect((await agente.get(`/api/cotizaciones/${v1.id}`)).body.valor_uf).toBe(41098.15);
  });

  it('crear sin indicador deja los tres campos en null; duplicar sin indicador copia los de la original', async () => {
    const { agente } = await como();
    const { ot } = await otFacturable();
    const c = await crear(agente, ot.id);
    expect(c).toMatchObject({ valor_uf: null, valor_uf_fecha: null, valor_uf_fuente: null });

    const otra = await otFacturable({ etapa: 'cotizada' });
    const enviada = await crearCotizacion(otra.ot.id, {
      estado: 'enviada',
      valor_uf: 40000,
      valor_uf_fecha: '2026-09-01',
      valor_uf_fuente: 'boostr',
    });
    const v2 = await agente.post(`/api/cotizaciones/${enviada.id}/duplicar`);
    expect(v2.status).toBe(201);
    expect(v2.body).toMatchObject({
      valor_uf: 40000,
      valor_uf_fecha: '2026-09-01',
      valor_uf_fuente: 'boostr',
    });
  });
});

describe('módulos (spec 8b §9.11)', () => {
  it('cotizaciones.service solo lee indicador_uf: leerUfVigente y la consulta de procedencia', () => {
    const fuente = readFileSync(
      fileURLToPath(new URL('./cotizaciones.service.ts', import.meta.url)),
      'utf8',
    );
    expect(fuente).toMatch(
      /import \{ leerUfVigente \} from '..\/indicadores\/indicadores\.service\.js'/,
    );
    expect(fuente).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM)\s+indicador_uf/i);
    const lecturas = fuente.match(/FROM indicador_uf/g) ?? [];
    expect(lecturas).toHaveLength(1);
    expect(fuente).toContain(
      'SELECT fecha::text AS fecha, fuente FROM indicador_uf WHERE valor = $1',
    );
  });
});
