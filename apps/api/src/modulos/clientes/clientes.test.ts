import { describe, expect, it } from 'vitest';
import { crearCliente, crearUsuario, ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });
const RUT_A = '76123465-K';
const RUT_B = '12345678-5';

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura') {
  return (await ingresarComo(app(), await crearUsuario({ rol }))).agente;
}

const entradaCliente = (extra: Record<string, unknown> = {}) => ({
  nombre: 'Viña Santa Clara',
  rut: '76.123.465-k',
  direccion: null,
  es_interno: false,
  condicion_pago: '30 días',
  exige_oc: true,
  notas: null,
  ...extra,
});

const fechaRelativa = async (dias: number): Promise<string> => {
  const [f] = await dataSource.query(
    `SELECT ((now() AT TIME ZONE 'America/Santiago')::date + $1::int)::text AS d`,
    [dias],
  );
  return f.d;
};

const bolsa = (desde: string, hasta: string | null, extra = {}) => ({
  horas_mes: 20,
  vigente_desde: desde,
  vigente_hasta: hasta,
  fecha_renovacion: null,
  notas: null,
  ...extra,
});

describe('clientes', () => {
  it('crea (normaliza el RUT), obtiene y lista', async () => {
    const admin = await como('admin');
    const r = await admin.post('/api/clientes').send(entradaCliente());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      nombre: 'Viña Santa Clara',
      rut: RUT_A,
      activo: true,
      contactos: [],
      tarifas: [],
      bolsa: { vigente: null, historial: [] },
    });
    const ficha = await admin.get(`/api/clientes/${r.body.id}`);
    expect(ficha.status).toBe(200);
    const lista = await admin.get('/api/clientes');
    expect(lista.body).toEqual([
      {
        id: r.body.id,
        nombre: 'Viña Santa Clara',
        rut: r.body.rut,
        es_interno: false,
        activo: true,
        tiene_bolsa: false,
        tickets_abiertos: 0,
      },
    ]);
  });

  it('409 con campo si el nombre o el RUT ya existen (al crear y al editar)', async () => {
    const admin = await como('admin');
    await admin.post('/api/clientes').send(entradaCliente());
    const dupRut = await admin.post('/api/clientes').send(entradaCliente({ nombre: 'Otro' }));
    expect(dupRut.status).toBe(409);
    expect(dupRut.body.error.detalles).toEqual({ campo: 'rut' });
    const dupNombre = await admin
      .post('/api/clientes')
      .send(entradaCliente({ nombre: 'VIÑA SANTA CLARA', rut: RUT_B }));
    expect(dupNombre.status).toBe(409);
    expect(dupNombre.body.error.detalles).toEqual({ campo: 'nombre' });

    const otro = await admin
      .post('/api/clientes')
      .send(entradaCliente({ nombre: 'Otro', rut: RUT_B }));
    expect(otro.status).toBe(201);
    const edit = await admin.patch(`/api/clientes/${otro.body.id}`).send({ rut: RUT_A });
    expect(edit.status).toBe(409);
    expect(edit.body.error.detalles).toEqual({ campo: 'rut' });
  });

  it('RUT inválido → 400; PATCH parcial no toca los demás campos; 404', async () => {
    const admin = await como('admin');
    expect(
      (await admin.post('/api/clientes').send(entradaCliente({ rut: '76123456-K' }))).status,
    ).toBe(400);
    const c = await admin.post('/api/clientes').send(entradaCliente());
    const p = await admin.patch(`/api/clientes/${c.body.id}`).send({ direccion: 'Calle 1' });
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ direccion: 'Calle 1', nombre: 'Viña Santa Clara', rut: RUT_A });
    expect((await admin.patch('/api/clientes/99999').send({ nombre: 'x' })).status).toBe(404);
    expect((await admin.get('/api/clientes/99999')).status).toBe(404);
  });

  it('desactivar y reactivar; la lista filtra por activo y por q (nombre o RUT)', async () => {
    const admin = await como('admin');
    const a = await admin.post('/api/clientes').send(entradaCliente());
    await admin.post('/api/clientes').send(entradaCliente({ nombre: 'Andes', rut: RUT_B }));
    const d = await admin.post(`/api/clientes/${a.body.id}/desactivar`).send();
    expect(d.body.activo).toBe(false);
    expect(
      (await admin.get('/api/clientes')).body.map((c: { nombre: string }) => c.nombre),
    ).toEqual(['Andes']);
    expect(
      (await admin.get('/api/clientes?activo=false')).body.map((c: { nombre: string }) => c.nombre),
    ).toEqual(['Viña Santa Clara']);
    expect((await admin.post(`/api/clientes/${a.body.id}/reactivar`).send()).body.activo).toBe(
      true,
    );
    expect((await admin.get('/api/clientes?q=andes')).body).toHaveLength(1);
    expect((await admin.get('/api/clientes?q=12.345.678')).body).toHaveLength(1);
    expect((await admin.get('/api/clientes?q=76123465')).body).toHaveLength(1);
    expect((await admin.get('/api/clientes?q=zzz')).body).toHaveLength(0);
  });

  it('clientes, contactos, bolsa y tarifas no generan evento ni auditoría', async () => {
    const admin = await como('admin');
    const antes = await dataSource.query(
      `SELECT (SELECT count(*) FROM evento)::int AS e, (SELECT count(*) FROM auditoria)::int AS a`,
    );
    const c = await admin.post('/api/clientes').send(entradaCliente());
    await admin.post(`/api/clientes/${c.body.id}/contactos`).send({
      nombre: 'Paula',
      area: null,
      correo: null,
      telefono: null,
      aprueba_cotizaciones: false,
    });
    await admin
      .put(`/api/clientes/${c.body.id}/tarifas`)
      .send([{ concepto: 'hora_normal', valor: 1 }]);
    const despues = await dataSource.query(
      `SELECT (SELECT count(*) FROM evento)::int AS e, (SELECT count(*) FROM auditoria)::int AS a`,
    );
    expect(despues).toEqual(antes);
  });
});

describe('contactos', () => {
  const contacto = {
    nombre: 'Paula Herrera',
    area: 'Administración',
    correo: 'PHerrera@Vina.cl',
    telefono: null,
    aprueba_cotizaciones: true,
  };

  it('técnico crea, edita y borra; se ven en la ficha; 404 si no pertenece al cliente', async () => {
    const tecnico = await como('tecnico');
    const c = await crearCliente();
    const otro = await crearCliente();
    const r = await tecnico.post(`/api/clientes/${c.id}/contactos`).send(contacto);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      cliente_id: c.id,
      correo: 'pherrera@vina.cl',
      aprueba_cotizaciones: true,
      activo: true,
    });
    const p = await tecnico
      .patch(`/api/clientes/${c.id}/contactos/${r.body.id}`)
      .send({ telefono: '+56 9 1111 1111' });
    expect(p.body).toMatchObject({ telefono: '+56 9 1111 1111', nombre: 'Paula Herrera' });
    expect((await tecnico.get(`/api/clientes/${c.id}`)).body.contactos).toHaveLength(1);

    expect(
      (await tecnico.patch(`/api/clientes/${otro.id}/contactos/${r.body.id}`).send({ nombre: 'x' }))
        .status,
    ).toBe(404);
    expect((await tecnico.delete(`/api/clientes/${otro.id}/contactos/${r.body.id}`)).status).toBe(
      404,
    );
    expect((await tecnico.post('/api/clientes/99999/contactos').send(contacto)).status).toBe(404);
    expect((await tecnico.delete(`/api/clientes/${c.id}/contactos/${r.body.id}`)).status).toBe(204);
    expect((await tecnico.get(`/api/clientes/${c.id}`)).body.contactos).toHaveLength(0);
  });

  // Prueba de seguridad 3 (§15, B10)
  it('lectura → POST contactos 403 (y PATCH/DELETE), pero GET /api/clientes 200', async () => {
    const lectura = await como('lectura');
    const c = await crearCliente();
    const crear = await lectura.post(`/api/clientes/${c.id}/contactos`).send(contacto);
    expect(crear.status).toBe(403);
    expect(crear.body.error.codigo).toBe('SIN_PERMISO');
    expect((await lectura.patch(`/api/clientes/${c.id}/contactos/1`).send({})).status).toBe(403);
    expect((await lectura.delete(`/api/clientes/${c.id}/contactos/1`)).status).toBe(403);
    expect((await lectura.get('/api/clientes')).status).toBe(200);
    expect((await lectura.get(`/api/clientes/${c.id}`)).status).toBe(200);
  });

  it('técnico no puede crear/editar clientes, bolsa ni tarifas', async () => {
    const tecnico = await como('tecnico');
    const c = await crearCliente();
    expect((await tecnico.post('/api/clientes').send(entradaCliente())).status).toBe(403);
    expect((await tecnico.patch(`/api/clientes/${c.id}`).send({})).status).toBe(403);
    expect(
      (await tecnico.post(`/api/clientes/${c.id}/bolsa`).send(bolsa('2026-01-01', null))).status,
    ).toBe(403);
    expect((await tecnico.put(`/api/clientes/${c.id}/tarifas`).send([])).status).toBe(403);
  });
});

describe('bolsa de horas', () => {
  it('coordinación (ots.aprobar) y admin pueden crear; vigente según la fecha de hoy', async () => {
    const coord = await como('coordinacion');
    const c = await crearCliente();
    const hoy = await fechaRelativa(0);
    const r = await coord
      .post(`/api/clientes/${c.id}/bolsa`)
      .send(bolsa(hoy, null, { horas_mes: 20.5 }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      horas_mes: 20.5,
      vigente: true,
      horas_usadas_mes: null,
      cliente_id: c.id,
    });
    const ficha = (await coord.get(`/api/clientes/${c.id}`)).body;
    expect(ficha.bolsa.vigente.id).toBe(r.body.id);
    expect(ficha.bolsa.historial).toHaveLength(1);
    expect((await coord.get('/api/clientes')).body[0].tiene_bolsa).toBe(true);
  });

  it('bolsa.vigente por fechas: pasado, presente y futuro', async () => {
    const admin = await como('admin');
    const c = await crearCliente();
    const pasado = await admin
      .post(`/api/clientes/${c.id}/bolsa`)
      .send(bolsa(await fechaRelativa(-60), await fechaRelativa(-31)));
    const actual = await admin
      .post(`/api/clientes/${c.id}/bolsa`)
      .send(bolsa(await fechaRelativa(-30), await fechaRelativa(0)));
    const futuro = await admin
      .post(`/api/clientes/${c.id}/bolsa`)
      .send(bolsa(await fechaRelativa(1), null));
    expect([pasado.status, actual.status, futuro.status]).toEqual([201, 201, 201]);
    expect([pasado.body.vigente, actual.body.vigente, futuro.body.vigente]).toEqual([
      false,
      true,
      false,
    ]);
    const ficha = (await admin.get(`/api/clientes/${c.id}`)).body;
    expect(ficha.bolsa.vigente.id).toBe(actual.body.id);
    expect(ficha.bolsa.historial.map((b: { id: number }) => b.id)).toEqual([
      futuro.body.id,
      actual.body.id,
      pasado.body.id,
    ]);
  });

  it('409 solapa_vigente al crear y al editar; vigente_hasta < desde → 400', async () => {
    const admin = await como('admin');
    const c = await crearCliente();
    const a = await admin
      .post(`/api/clientes/${c.id}/bolsa`)
      .send(bolsa('2026-01-01', '2026-06-30'));
    expect(a.status).toBe(201);
    const solapa = await admin.post(`/api/clientes/${c.id}/bolsa`).send(bolsa('2026-06-30', null));
    expect(solapa.status).toBe(409);
    expect(solapa.body.error.detalles).toEqual({ motivo: 'solapa_vigente' });
    expect(
      (await admin.post(`/api/clientes/${c.id}/bolsa`).send(bolsa('2025-01-01', '2026-01-01')))
        .status,
    ).toBe(409);
    const b = await admin.post(`/api/clientes/${c.id}/bolsa`).send(bolsa('2026-07-01', null));
    expect(b.status).toBe(201);
    const edit = await admin
      .patch(`/api/clientes/${c.id}/bolsa/${b.body.id}`)
      .send({ vigente_desde: '2026-06-01' });
    expect(edit.status).toBe(409);
    // editarse a sí mismo no cuenta como solape
    const ok = await admin
      .patch(`/api/clientes/${c.id}/bolsa/${a.body.id}`)
      .send({ horas_mes: 30 });
    expect(ok.status).toBe(200);
    expect(ok.body.horas_mes).toBe(30);
    // cerrar el contrato y renovar (ADR 0015)
    expect(
      (
        await admin
          .patch(`/api/clientes/${c.id}/bolsa/${b.body.id}`)
          .send({ vigente_hasta: '2026-12-31' })
      ).status,
    ).toBe(200);
    const malo = await admin
      .patch(`/api/clientes/${c.id}/bolsa/${b.body.id}`)
      .send({ vigente_hasta: '2026-01-01' });
    expect(malo.status).toBe(400);
    expect(
      (await admin.post(`/api/clientes/${c.id}/bolsa`).send(bolsa('2026-02-01', '2026-01-01')))
        .status,
    ).toBe(400);
  });

  it('404 si el contrato no es del cliente; horas fuera de rango o no múltiplo de 0,5 → 400', async () => {
    const admin = await como('admin');
    const c = await crearCliente();
    const otro = await crearCliente();
    const r = await admin.post(`/api/clientes/${c.id}/bolsa`).send(bolsa('2026-01-01', null));
    expect(
      (await admin.patch(`/api/clientes/${otro.id}/bolsa/${r.body.id}`).send({ horas_mes: 5 }))
        .status,
    ).toBe(404);
    expect(
      (await admin.post('/api/clientes/99999/bolsa').send(bolsa('2026-01-01', null))).status,
    ).toBe(404);
    expect(
      (
        await admin
          .post(`/api/clientes/${otro.id}/bolsa`)
          .send(bolsa('2026-01-01', null, { horas_mes: 10.3 }))
      ).status,
    ).toBe(400);
  });
});

describe('tarifas', () => {
  it('reemplaza el conjunto completo y las devuelve en el orden de los conceptos', async () => {
    const admin = await como('admin');
    const c = await crearCliente();
    const r1 = await admin.put(`/api/clientes/${c.id}/tarifas`).send([
      { concepto: 'hora_extendida', valor: 45000 },
      { concepto: 'hora_normal', valor: 38000.5 },
    ]);
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual([
      { concepto: 'hora_normal', valor: 38000.5 },
      { concepto: 'hora_extendida', valor: 45000 },
    ]);
    const r2 = await admin
      .put(`/api/clientes/${c.id}/tarifas`)
      .send([{ concepto: 'traslado_km', valor: 500 }]);
    expect(r2.body).toEqual([{ concepto: 'traslado_km', valor: 500 }]);
    expect((await admin.get(`/api/clientes/${c.id}`)).body.tarifas).toEqual([
      { concepto: 'traslado_km', valor: 500 },
    ]);
    expect((await admin.put(`/api/clientes/${c.id}/tarifas`).send([])).body).toEqual([]);
  });

  it('conceptos repetidos o valores negativos → 400; cliente inexistente → 404', async () => {
    const admin = await como('admin');
    const c = await crearCliente();
    const rep = [
      { concepto: 'hora_normal', valor: 1 },
      { concepto: 'hora_normal', valor: 2 },
    ];
    expect((await admin.put(`/api/clientes/${c.id}/tarifas`).send(rep)).status).toBe(400);
    expect(
      (
        await admin
          .put(`/api/clientes/${c.id}/tarifas`)
          .send([{ concepto: 'hora_normal', valor: -1 }])
      ).status,
    ).toBe(400);
    expect((await admin.put('/api/clientes/99999/tarifas').send([])).status).toBe(404);
  });
});
