import { describe, expect, it } from 'vitest';
import {
  crearCategoria,
  crearCliente,
  crearDepartamento,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(
  rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura',
  departamento_id?: number,
) {
  const usuario = await crearUsuario({ rol, departamento_id: departamento_id ?? null });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const entrada = (extra: Record<string, unknown> = {}) => ({
  asunto: 'Error al emitir facturas',
  descripcion: null,
  cliente_id: null,
  solicitante_nombre: null,
  solicitante_correo: null,
  origen: 'externo',
  prioridad: 'media',
  categoria_id: null,
  inicio_planificado: null,
  fecha_limite: null,
  horas_estimadas: null,
  ...extra,
});

const eventos = (id: number) =>
  dataSource.query(
    `SELECT accion, campo, valor_anterior, valor_nuevo, datos, autor_id, req_id FROM evento
      WHERE entidad = 'ticket' AND entidad_id = $1 ORDER BY id`,
    [String(id)],
  );

describe('crear ticket', () => {
  it('201 con código de la numeración real; dos tickets → TK-1000 y TK-1001', async () => {
    const { agente, usuario } = await como('tecnico');
    const otro = await crearUsuario();
    const cliente = await crearCliente();
    const r = await agente.post('/api/tickets').send(
      entrada({
        cliente_id: cliente.id,
        responsable_principal_id: usuario.id,
        responsables_ids: [otro.id],
        seguidores_ids: [otro.id],
        solicitante_nombre: 'Paula Herrera',
        solicitante_correo: 'PHerrera@Ejemplo.test',
        horas_estimadas: 2.5,
      }),
    );
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      numero: 1000,
      codigo: 'TK-1000',
      estado: 'nuevo',
      prioridad: 'media',
      cliente: { id: cliente.id, nombre: cliente.nombre, es_interno: false },
      solicitante_correo: 'pherrera@ejemplo.test',
      horas_estimadas: 2.5,
      creado_por: { id: usuario.id },
      tipo: 'ticket',
      ot_vinculada: null,
      ots: [],
      n_mensajes: 0,
      tiene_correo: false,
      tareas: [],
      archivos: [],
      correo: null,
      cerrado_en: null,
      archivado_en: null,
    });
    expect(
      r.body.responsables.map((x: { id: number; principal: boolean }) => [x.id, x.principal]),
    ).toEqual([
      [usuario.id, true],
      [otro.id, false],
    ]);
    expect(r.body.seguidores.map((x: { id: number }) => x.id)).toEqual([otro.id]);
    const r2 = await agente.post('/api/tickets').send(entrada());
    expect(r2.body.codigo).toBe('TK-1001');
    const evs = await eventos(r.body.id);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      accion: 'creado',
      autor_id: usuario.id,
      datos: { desde_correo: false, adjuntos_extraidos: 0, codigo: 'TK-1000' },
    });
    expect(evs[0].req_id).toBe(r.headers['x-request-id']);
  });

  it('GET /api/config/numeracion refleja los tickets reales y el inicial no puede bajar de ellos', async () => {
    const { agente } = await como('admin');
    await agente.post('/api/tickets').send(entrada());
    await agente.post('/api/tickets').send(entrada());
    const n = await agente.get('/api/config/numeracion');
    expect(n.body.ticket).toMatchObject({ ultimo_usado: 1001, usados: 2 });
    const r = await agente.put('/api/config/numeracion').send({
      ticket: { prefijo: 'TK-', inicial: 1001, digitos: 4, modo: 'correlativo' },
      ot: { prefijo: 'OT-', inicial: 200, digitos: 4 },
    });
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('NUMERACION_INICIAL_MENOR');
  });

  it('una creación que falla después de asignar número no lo consume', async () => {
    const { agente } = await como('tecnico');
    const mal = await agente
      .post('/api/tickets')
      .send(entrada({ responsable_principal_id: 99999 }));
    expect(mal.status).toBe(400);
    expect(mal.body.error.codigo).toBe('VALIDACION');
    expect(mal.body.error.detalles).toHaveProperty('responsable_principal_id');
    const ok = await agente.post('/api/tickets').send(entrada());
    expect(ok.body.codigo).toBe('TK-1000');
    // fallo con el número ya asignado: la transacción lo revierte
    const inactivo = await crearUsuario({ activo: false });
    const cat = await crearCategoria();
    const falla = await agente
      .post('/api/tickets')
      .send(entrada({ categoria_id: cat.id, seguidores_ids: [inactivo.id] }));
    expect(falla.status).toBe(400);
    expect((await agente.post('/api/tickets').send(entrada())).body.codigo).toBe('TK-1001');
  });

  it('modo aleatorio: 100 creaciones (3 dígitos, inicial 100) no repiten y caen en rango', async () => {
    const { agente } = await como('admin');
    await dataSource.query(
      `UPDATE contador SET modo = 'aleatorio', digitos = 3, inicial = 100 WHERE clave = 'ticket'`,
    );
    const numeros = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const r = await agente.post('/api/tickets').send(entrada());
      expect(r.status).toBe(201);
      expect(r.body.numero).toBeGreaterThanOrEqual(100);
      expect(r.body.numero).toBeLessThan(1000);
      numeros.add(r.body.numero);
    }
    expect(numeros.size).toBe(100);
  }, 60_000);

  it('valida referencias por campo (cliente, categoría y usuarios inactivos) → 400', async () => {
    const { agente } = await como('tecnico');
    const inactivo = await crearUsuario({ activo: false });
    const inactivo2 = await crearUsuario({ activo: false });
    const cliente = await crearCliente({ activo: false });
    const categoria = await crearCategoria({ activo: false });
    const r = await agente.post('/api/tickets').send(
      entrada({
        cliente_id: cliente.id,
        categoria_id: categoria.id,
        responsable_principal_id: inactivo.id,
        responsables_ids: [inactivo2.id],
        seguidores_ids: [999999],
      }),
    );
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.detalles).sort()).toEqual([
      'categoria_id',
      'cliente_id',
      'responsable_principal_id',
      'responsables_ids',
      'seguidores_ids',
    ]);
  });

  it('fechas invertidas y principal repetido en otros → 400 (esquema)', async () => {
    const { agente, usuario } = await como('tecnico');
    const a = await agente.post('/api/tickets').send(
      entrada({
        inicio_planificado: '2026-10-02T12:00:00Z',
        fecha_limite: '2026-10-01T12:00:00Z',
      }),
    );
    expect(a.status).toBe(400);
    const b = await agente
      .post('/api/tickets')
      .send(entrada({ responsable_principal_id: usuario.id, responsables_ids: [usuario.id] }));
    expect(b.status).toBe(400);
  });
});

describe('plazos al crear (prueba 12, ADR 0005)', () => {
  // jueves 17-sep-2026 17:00 en Santiago (UTC-3) = 20:00Z; 18 y 19 son feriados/fin de semana
  const JUEVES = '2026-09-17T20:00:00.000Z';

  async function feriados() {
    await dataSource.query(
      `INSERT INTO feriado (fecha, nombre, departamento_id) VALUES ('2026-09-18', 'Fiestas Patrias', NULL), ('2026-09-19', 'Glorias del Ejército', NULL) ON CONFLICT DO NOTHING`,
    );
  }

  it('alta = 1 día hábil con principal de Soporte TI → lunes 21-sep 17:00; respuesta_limite calculada', async () => {
    await feriados();
    const depto = await crearDepartamento({ nombre: 'Soporte TI' });
    const principal = await crearUsuario({ departamento_id: depto.id });
    const { agente } = await como('tecnico');
    const cat = await crearCategoria();
    const r = await agente.post('/api/tickets').send(
      entrada({
        prioridad: 'alta',
        categoria_id: cat.id,
        responsable_principal_id: principal.id,
        inicio_planificado: JUEVES,
      }),
    );
    expect(r.status).toBe(201);
    expect(r.body.fecha_limite).toBe('2026-09-21T20:00:00.000Z');
    // respuesta: 2 h hábiles desde jueves 17:00 → 1 h el jueves (hasta 18:00) + 1 h el lunes desde 08:30
    expect(r.body.respuesta_limite).toBe('2026-09-21T12:30:00.000Z');
  });

  it('sin principal ni categoría no hay fecha límite; la enviada se respeta', async () => {
    await feriados();
    const depto = await crearDepartamento();
    const { agente } = await como('tecnico', depto.id); // el actor tiene departamento
    const sin = await agente.post('/api/tickets').send(entrada({ inicio_planificado: JUEVES }));
    expect(sin.body.fecha_limite).toBeNull();
    expect(sin.body.respuesta_limite).toBeNull();
    const cat = await crearCategoria();
    const propia = await agente.post('/api/tickets').send(
      entrada({
        categoria_id: cat.id,
        inicio_planificado: JUEVES,
        fecha_limite: '2026-10-05T15:00:00.000Z',
      }),
    );
    expect(propia.body.fecha_limite).toBe('2026-10-05T15:00:00.000Z');
    expect(propia.body.respuesta_limite).not.toBeNull();
  });

  it('calendario: sin departamento del principal usa el del responsable por defecto y luego el del actor', async () => {
    await feriados();
    const depto = await crearDepartamento();
    const sinDepto = await crearUsuario();
    const defecto = await crearUsuario({ departamento_id: depto.id });
    const cat = await crearCategoria({ responsable_defecto_id: defecto.id });
    const { agente } = await como('tecnico');
    const r = await agente.post('/api/tickets').send(
      entrada({
        prioridad: 'alta',
        categoria_id: cat.id,
        responsable_principal_id: sinDepto.id,
        inicio_planificado: JUEVES,
      }),
    );
    expect(r.body.fecha_limite).toBe('2026-09-21T20:00:00.000Z');
    // la categoría no asigna el responsable por defecto
    expect(r.body.responsables.map((x: { id: number }) => x.id)).toEqual([sinDepto.id]);

    const conDepto = await como('tecnico', depto.id);
    const cat2 = await crearCategoria();
    const r2 = await conDepto.agente
      .post('/api/tickets')
      .send(entrada({ prioridad: 'alta', categoria_id: cat2.id, inicio_planificado: JUEVES }));
    expect(r2.body.fecha_limite).toBe('2026-09-21T20:00:00.000Z');
  });
});

describe('leer y editar', () => {
  it('GET /api/tickets/:id: 200 para lectura, 404 si no existe, 400 si el id no es numérico', async () => {
    const t = await crearTicket();
    const { agente } = await como('lectura');
    const r = await agente.get(`/api/tickets/${t.id}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: t.id, codigo: t.codigo, estado: 'nuevo' });
    expect((await agente.get('/api/tickets/999999')).status).toBe(404);
    expect((await agente.get('/api/tickets/abc')).status).toBe(400);
  });

  it('PATCH edita y deja un evento cambio por campo con valores resueltos', async () => {
    const { agente, usuario } = await como('tecnico');
    const c1 = await crearCliente({ nombre: 'Viña Santa Clara' });
    const c2 = await crearCliente({ nombre: 'Transportes Austral' });
    const cat = await crearCategoria({ nombre: 'ERP / Facturación' });
    const t = await crearTicket({ cliente_id: c1.id, creado_por: usuario.id });
    const r = await agente.patch(`/api/tickets/${t.id}`).send({
      asunto: 'Nuevo asunto',
      cliente_id: c2.id,
      prioridad: 'urgente',
      categoria_id: cat.id,
      horas_estimadas: 3.5,
      fecha_limite: '2026-10-01T15:00:00.000Z',
      solicitante_nombre: 'Paula',
      solicitante_correo: 'p@ejemplo.test',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      asunto: 'Nuevo asunto',
      prioridad: 'urgente',
      categoria: { id: cat.id, nombre: 'ERP / Facturación' },
      horas_estimadas: 3.5,
    });
    const evs = (await eventos(t.id)).filter((e: { accion: string }) => e.accion === 'cambio');
    const por = Object.fromEntries(
      evs.map((e: { campo: string; valor_anterior: string | null; valor_nuevo: string | null }) => [
        e.campo,
        [e.valor_anterior, e.valor_nuevo],
      ]),
    );
    expect(por['asunto']).toEqual([t.asunto, 'Nuevo asunto']);
    expect(por['cliente']).toEqual(['Viña Santa Clara', 'Transportes Austral']);
    expect(por['prioridad']).toEqual(['Media', 'Urgente']);
    expect(por['categoria']).toEqual([null, 'ERP / Facturación']);
    expect(por['horas_estimadas']).toEqual([null, '3,5 h']);
    expect(por['solicitante']).toEqual([null, 'Paula <p@ejemplo.test>']);
    expect(por['fecha_limite'][0]).toBeNull();
    expect(por['fecha_limite'][1]).toMatch(/2026/);
    expect(evs).toHaveLength(7);
    // sin cambios reales no se agregan eventos
    await agente.patch(`/api/tickets/${t.id}`).send({ asunto: 'Nuevo asunto' });
    expect(await eventos(t.id)).toHaveLength(7);
  });

  it('PATCH de la descripción guarda la etiqueta recortada a 120 caracteres', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    await agente.patch(`/api/tickets/${t.id}`).send({ descripcion: 'x'.repeat(200) });
    const [e] = (await eventos(t.id)).filter((x: { campo: string }) => x.campo === 'descripcion');
    expect(e.valor_nuevo).toBe(`${'x'.repeat(120)}…`);
  });

  it('PATCH valida referencias y fechas; 404 si no existe', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket();
    const cliente = await crearCliente({ activo: false });
    const r = await agente.patch(`/api/tickets/${t.id}`).send({ cliente_id: cliente.id });
    expect(r.status).toBe(400);
    expect(r.body.error.detalles).toHaveProperty('cliente_id');
    const f = await agente.patch(`/api/tickets/${t.id}`).send({
      inicio_planificado: '2026-10-02T12:00:00Z',
      fecha_limite: '2026-10-01T12:00:00Z',
    });
    expect(f.status).toBe(400);
    expect((await agente.patch('/api/tickets/999999').send({ asunto: 'x' })).status).toBe(404);
  });

  it('PATCH de un ticket cerrado → 409 TICKET_CERRADO con X-Request-Id', async () => {
    const { agente } = await como('tecnico');
    const t = await crearTicket({ estado: 'resuelto' });
    const r = await agente.patch(`/api/tickets/${t.id}`).send({ asunto: 'Otro' });
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('TICKET_CERRADO');
    expect(r.headers['x-request-id']).toBeTruthy();
    expect((await eventos(t.id)).length).toBe(0);
  });

  it('el detalle incluye tareas, correo y archivos propios del ticket', async () => {
    const { usuario } = await como('tecnico');
    const t = await crearTicket({ creado_por: usuario.id });
    const [ca]: { id: number }[] = await dataSource.query(
      `INSERT INTO correo_adjunto (ticket_id, origen, de, asunto, cuerpo) VALUES ($1, 'texto', 'a@ejemplo.test', 'Asunto', 'Cuerpo') RETURNING id`,
      [t.id],
    );
    await dataSource.query(
      `INSERT INTO archivo (entidad, entidad_id, categoria, nombre_original, tipo_mime, tamano, clave, origen_correo_id, subido_por)
       VALUES ('ticket', $1, 'documento', 'extraido.pdf', 'application/pdf', 10, 'a/b/1.pdf', $2, $3),
              ('ticket', $1, 'foto', 'foto.jpg', 'image/jpeg', 10, 'a/b/2.jpg', NULL, $3)`,
      [t.id, ca!.id, usuario.id],
    );
    await dataSource.query(
      `INSERT INTO tarea (ticket_id, titulo, orden, fecha) VALUES ($1, 'Llamar', 1, '2020-01-01')`,
      [t.id],
    );
    const { agente } = await como('lectura');
    const r = await agente.get(`/api/tickets/${t.id}`);
    expect(r.status).toBe(200);
    expect(r.body.tiene_correo).toBe(true);
    expect(r.body.correo).toMatchObject({ origen: 'texto', asunto: 'Asunto', archivo: null });
    expect(
      r.body.correo.adjuntos.map((a: { nombre_original: string }) => a.nombre_original),
    ).toEqual(['extraido.pdf']);
    expect(r.body.correo.adjuntos[0]).toMatchObject({ origen_correo: true, es_imagen: false });
    expect(r.body.archivos.map((a: { nombre_original: string }) => a.nombre_original)).toEqual([
      'foto.jpg',
    ]);
    expect(r.body.archivos[0]).toMatchObject({
      es_imagen: true,
      url: expect.stringMatching(/^\/api\/archivos\/\d+$/),
    });
    expect(r.body.tareas).toMatchObject([
      { titulo: 'Llamar', vencida: true, hecha: false, fecha: '2020-01-01' },
    ]);
  });
});
