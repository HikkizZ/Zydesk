import { diasDeSemana, lunesDe, rutValido, ZONA } from '@zydesk/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { fuenteNumeros } from '../../core/numeracion/fuente.js';
import { siguienteNumero } from '../../core/numeracion/numeracion.js';
import { ErrorSemilla, sembrarDesarrollo } from './desarrollo.js';

const CLAVE = 'Semilla.Dev.2026';
const hoy = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());

async function contar(tabla: string, where = 'true'): Promise<number> {
  const [{ n }] = await dataSource.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE ${where}`);
  return n;
}

describe('sembrarDesarrollo', () => {
  it('es idempotente: dos ejecuciones dejan 11 usuarios, 3 departamentos, 8 clientes, 6 categorías y 1 bolsa', async () => {
    await sembrarDesarrollo(CLAVE);
    await sembrarDesarrollo(CLAVE);
    expect(await contar('usuario')).toBe(11);
    expect(await contar('departamento')).toBe(3);
    expect(await contar('horario_dia')).toBe(21);
    expect(await contar('cliente')).toBe(8);
    expect(await contar('cliente', 'es_interno')).toBe(4);
    expect(await contar('categoria')).toBe(6);
    expect(await contar('contrato_bolsa')).toBe(1);
    expect(await contar('tarifa_cliente')).toBe(2);
    expect(await contar('contacto')).toBe(4);
  });

  it('el RUT sembrado es válido y hikki ingresa con la contraseña de semilla, sin pendientes', async () => {
    await sembrarDesarrollo(CLAVE);
    const [c] = await dataSource.query(`SELECT rut FROM cliente WHERE rut IS NOT NULL`);
    expect(rutValido(c.rut)).toBe(true);
    const agente = request
      .agent(crearApp({ comprobarBd: async () => true }))
      .set('X-Requested-With', 'Zydesk');
    const res = await agente
      .post('/api/auth/ingresar')
      .send({ correo: 'hikki@zydesk.local', contrasena: CLAVE });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      rol: 'admin',
      debe_cambiar_contrasena: false,
      debe_aceptar_terminos: false,
    });
    expect(res.body.departamento.nombre).toBe('Coordinación');
  });

  it('las categorías derivan las prioridades del plazo alta', async () => {
    await sembrarDesarrollo(CLAVE);
    const [c] = await dataSource.query(
      `SELECT plazo_respuesta, plazo_resolucion FROM categoria WHERE nombre = 'Hardware y equipos'`,
    );
    expect(c.plazo_respuesta).toEqual({ valor: 4, unidad: 'horas' });
    expect(c.plazo_resolucion).toEqual({
      urgente: { valor: 2, unidad: 'dias' },
      alta: { valor: 3, unidad: 'dias' },
      media: { valor: 6, unidad: 'dias' },
      baja: { valor: 9, unidad: 'dias' },
    });
  });

  it('rechaza una contraseña ausente o que incumple la política', async () => {
    await expect(sembrarDesarrollo(undefined)).rejects.toThrow(ErrorSemilla);
    await expect(sembrarDesarrollo('corta')).rejects.toThrow('SEMILLA_PASSWORD');
  });

  it('siembra 18 tickets (1 archivado), TK-1048 completo y deja el contador listo para TK-1054', async () => {
    await sembrarDesarrollo(CLAVE);
    await sembrarDesarrollo(CLAVE);
    expect(await contar('ticket')).toBe(18);
    expect(await contar('ticket', 'archivado_en IS NOT NULL')).toBe(1);
    expect(await contar('ticket', "estado IN ('resuelto','descartado','duplicado')")).toBe(6);
    expect(await contar('correo_adjunto')).toBe(7);
    const [t] = await dataSource.query(`SELECT id FROM ticket WHERE codigo = 'TK-1048'`);
    expect(await contar('tarea', `ticket_id = ${t.id}`)).toBe(5);
    expect(await contar('tarea', `ticket_id = ${t.id} AND hecha`)).toBe(2);
    expect(await contar('mensaje', `ticket_id = ${t.id}`)).toBe(4);
    expect(await contar('mensaje', `ticket_id = ${t.id} AND tipo = 'nota_interna'`)).toBe(2);
    expect(await contar('mencion')).toBe(1);
    expect(await contar('registro_horas', `ticket_id = ${t.id}`)).toBe(2);
    expect(await contar('evento', `entidad = 'ticket' AND entidad_id = '${t.id}'`)).toBe(6);
    const [{ valor }] = await dataSource.query(`SELECT valor FROM contador WHERE clave = 'ticket'`);
    expect(valor).toBeGreaterThanOrEqual(1053);
    const siguiente = await enTransaccion((tx) => siguienteNumero(tx, 'ticket', fuenteNumeros));
    expect(siguiente.codigo).toBe('TK-1054');
  });

  it('siembra 6 OT idempotentes, OT-0218 completa y el contador de OT listo para OT-0220', async () => {
    await sembrarDesarrollo(CLAVE);
    await sembrarDesarrollo(CLAVE);
    expect(await contar('ot')).toBe(6);
    expect(await contar('aprobacion_cliente')).toBe(2);
    const [o] = await dataSource.query(`SELECT id, etapa, tipo FROM ot WHERE codigo = 'OT-0218'`);
    expect(o).toMatchObject({ etapa: 'cotizada', tipo: 'facturable' });
    expect(await contar('tarea', `ot_id = ${o.id}`)).toBe(4);
    const [{ h }] = await dataSource.query(
      `SELECT sum(horas_estimadas)::float8 AS h FROM tarea WHERE ot_id = ${o.id}`,
    );
    expect(h).toBe(10);
    expect(await contar('archivo', `entidad = 'ot' AND entidad_id = ${o.id}`)).toBe(3);
    expect(await contar('mensaje', `ot_id = ${o.id}`)).toBe(1);
    expect(await contar('registro_horas', `ot_id = ${o.id} AND horas = 3`)).toBe(1);
    expect(await contar('evento', `entidad = 'ot' AND entidad_id = '${o.id}'`)).toBe(8);
    const [o216] = await dataSource.query(
      `SELECT o.id, o.etapa, o.estado_facturacion, o.resolvio_ticket FROM ot o WHERE codigo = 'OT-0216'`,
    );
    expect(o216).toMatchObject({
      etapa: 'cerrada',
      estado_facturacion: 'por_facturar',
      resolvio_ticket: true,
    });
    expect(await contar('aprobacion_cliente', `ot_id = ${o216.id}`)).toBe(1);
    expect(await contar('mensaje', 'copiado_desde_id IS NOT NULL')).toBe(1);
    const [{ valor }] = await dataSource.query(`SELECT valor FROM contador WHERE clave = 'ot'`);
    expect(valor).toBeGreaterThanOrEqual(219);
    const siguiente = await enTransaccion((tx) => siguienteNumero(tx, 'ot', fuenteNumeros));
    expect(siguiente.codigo).toBe('OT-0220');

    const agente = request
      .agent(crearApp({ comprobarBd: async () => true }))
      .set('X-Requested-With', 'Zydesk');
    await agente
      .post('/api/auth/ingresar')
      .send({ correo: 'hikki@zydesk.local', contrasena: CLAVE });
    const [t] = await dataSource.query(`SELECT id FROM ticket WHERE codigo = 'TK-1048'`);
    const res = await agente.get(`/api/tickets/${t.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ots.map((x: { codigo: string }) => x.codigo)).toEqual(['OT-0218']);
    const lista = await agente.get('/api/tickets?q=1048');
    expect(lista.body.datos[0].ot_vinculada.codigo).toBe('OT-0218');
  });

  it('siembra 4 cotizaciones idempotentes, 3 plantillas y las tarifas del diseño', async () => {
    await sembrarDesarrollo(CLAVE);
    await sembrarDesarrollo(CLAVE);
    expect(await contar('cotizacion')).toBe(4);
    expect(await contar('plantilla_cotizacion', 'activo')).toBe(3);
    expect(await contar('plantilla_linea')).toBe(10);
    const [c] = await dataSource.query(
      `SELECT c.id, c.estado, c.neto::float8 AS neto, c.total::float8 AS total, c.enviada_por
         FROM cotizacion c WHERE codigo = 'COT-0218' AND version = 1`,
    );
    expect(c).toMatchObject({ estado: 'enviada', neto: 475000, total: 565250 });
    expect(c.enviada_por).not.toBeNull();
    expect(await contar('linea_cotizacion', `cotizacion_id = ${c.id}`)).toBe(5);
    expect(await contar('cotizacion', "estado = 'aprobada' AND aprobada_en IS NOT NULL")).toBe(2);
    const [o218] = await dataSource.query(`SELECT id FROM ot WHERE codigo = 'OT-0218'`);
    for (const accion of ['cotizacion_creada', 'cotizacion_enviada']) {
      expect(
        await contar(
          'evento',
          `entidad = 'ot' AND entidad_id = '${o218.id}' AND accion = '${accion}' AND datos->>'cotizacion_id' = '${c.id}'`,
        ),
      ).toBe(1);
    }
    expect(
      await contar(
        'evento',
        `entidad = 'ot' AND entidad_id = '${o218.id}' AND campo = 'etapa' AND datos->>'cotizacion_id' = '${c.id}'`,
      ),
    ).toBe(1);
    expect(await contar('evento', "accion = 'cotizacion_aprobada'")).toBe(2);

    const agente = request
      .agent(crearApp({ comprobarBd: async () => true }))
      .set('X-Requested-With', 'Zydesk');
    await agente
      .post('/api/auth/ingresar')
      .send({ correo: 'hikki@zydesk.local', contrasena: CLAVE });
    const lista = await agente.get('/api/ots');
    expect(lista.status).toBe(200);
    const neto = (codigo: string) =>
      lista.body.datos.find((x: { codigo: string }) => x.codigo === codigo).neto;
    expect(neto('OT-0218')).toBe(475000);
    expect(neto('OT-0217')).toBe(1240000);
    expect(neto('OT-0214')).toBe(2150000);
    expect(neto('OT-0216')).toBe(680000);

    const [o215] = await dataSource.query(`SELECT id FROM ot WHERE codigo = 'OT-0215'`);
    const det = await agente.get(`/api/ots/${o215.id}`);
    expect(det.body.costo_interno.tarifa).toBe(18000);
    expect(det.body.costo_interno.monto).toBe(det.body.horas.registradas * 18000);
  });

  it('siembra la planilla de sdiaz con las cifras del diseño, sin fechas futuras y sin duplicar ni borrar', async () => {
    await sembrarDesarrollo(CLAVE);
    // una fila manual cargada a mano no debe perderse al volver a sembrar
    const [sd] = await dataSource.query(
      `SELECT id FROM usuario WHERE correo = 'sdiaz@zydesk.local'`,
    );
    await dataSource.query(
      `INSERT INTO registro_horas (usuario_id, fecha, descripcion, horas) VALUES ($1, $2, 'Prueba a mano', 1)`,
      [sd.id, lunesDe(hoy())],
    );
    const antes = await contar('registro_horas');
    await sembrarDesarrollo(CLAVE);
    expect(await contar('registro_horas')).toBe(antes);
    expect(await contar('registro_horas', "descripcion = 'Prueba a mano'")).toBe(1);

    const lunes = lunesDe(hoy());
    const conMartes = hoy() >= diasDeSemana(lunes)[1]!; // si hoy es lunes el martes es futuro y no se siembra
    const agente = request
      .agent(crearApp({ comprobarBd: async () => true }))
      .set('X-Requested-With', 'Zydesk');
    await agente
      .post('/api/auth/ingresar')
      .send({ correo: 'sdiaz@zydesk.local', contrasena: CLAVE });
    const res = await agente.get('/api/horas');
    expect(res.status).toBe(200);
    expect(res.body.editable).toBe(true);
    // la celda manual de prueba (1 h, "Sin ticket") suma al lunes: se descuenta para comparar con el diseño
    expect(res.body.totales.semana - 1).toBe(conMartes ? 12 : 7.5);
    expect(res.body.totales.facturables).toBe(conMartes ? 8.5 : 5);
    expect(res.body.totales.fuera_de_horario).toBe(conMartes ? 0.5 : 0);
    const claves = res.body.filas.map((f: { clave: string }) => f.clave);
    expect(claves.some((c: string) => c.includes(':tarea:'))).toBe(true);
    expect(
      res.body.filas.some(
        (f: { tarea: unknown; total: number }) => f.tarea !== null && f.total > 0,
      ),
    ).toBe(true);
    for (const d of res.body.dias as { futuro: boolean; total: number }[]) {
      if (d.futuro) expect(d.total).toBe(0);
    }

    const [o215] = await dataSource.query(`SELECT id FROM ot WHERE codigo = 'OT-0215'`);
    const ot = await agente.get(`/api/ots/${o215.id}`);
    expect(ot.body.costo_interno.monto).toBe(36000);

    const [c] = await dataSource.query(`SELECT id FROM cliente WHERE nombre = 'Viña Santa Clara'`);
    const cli = await agente.get(`/api/clientes/${c.id}`);
    expect(typeof cli.body.bolsa.vigente.horas_usadas_mes).toBe('number');
  });
});
