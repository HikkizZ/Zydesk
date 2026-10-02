import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  crearCliente,
  crearDepartamento,
  crearOt,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(
  rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura' = 'tecnico',
  departamento_id: number | null = null,
) {
  const usuario = await crearUsuario({ rol, departamento_id });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const ruta = (desde: string, hasta: string): string =>
  `/api/tickets/linea-de-tiempo?desde=${desde}&hasta=${hasta}`;
const fecha = (iso: string): Date => new Date(`${iso}T15:00:00Z`);
const dias = (n: number): Date => new Date(Date.now() + n * 86_400_000);
const hoySantiago = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
type Item = { id: number; limite: string | null; inicio: string; vencido: boolean };
const ids = (r: { body: { items: Item[] } }): number[] => r.body.items.map((i) => i.id);

describe('GET /api/tickets/linea-de-tiempo (spec fase 6 §11)', () => {
  it('dias: hábiles según el departamento de quien mira, con feriado', async () => {
    const depto = await crearDepartamento();
    // miércoles 12 de marzo de 2031: feriado del departamento
    await dataSource.query(
      `INSERT INTO feriado (fecha, nombre, departamento_id) VALUES ('2031-03-12', 'Feriado de prueba', $1)`,
      [depto.id],
    );
    const { agente } = await como('tecnico', depto.id);
    const r = await agente.get(ruta('2031-03-10', '2031-03-23'));
    expect(r.status).toBe(200);
    expect(r.body.dias).toHaveLength(14);
    const habiles = r.body.dias.filter((d: { habil: boolean }) => d.habil).length;
    expect(habiles).toBe(9); // 10 L-V menos el feriado
    expect(r.body.dias[2]).toEqual({
      fecha: '2031-03-12',
      habil: false,
      feriado: 'Feriado de prueba',
      hoy: false,
    });
    expect(r.body.dias[5]).toMatchObject({ fecha: '2031-03-15', habil: false, feriado: null });
    expect(r.body.dias[0]).toMatchObject({ habil: true, feriado: null });
  });

  it('usuario sin departamento: lunes a viernes sin feriados', async () => {
    const { agente } = await como();
    const r = await agente.get(ruta('2031-03-10', '2031-03-16'));
    expect(r.body.dias.map((d: { habil: boolean }) => d.habil)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(r.body.dias.every((d: { feriado: string | null }) => d.feriado === null)).toBe(true);
  });

  it('marca hoy', async () => {
    const { agente } = await como();
    const hoy = hoySantiago();
    const r = await agente.get(ruta(hoy, hoy));
    expect(r.body.dias).toEqual([expect.objectContaining({ fecha: hoy, hoy: true })]);
  });

  it('items: inicio fuera del rango pero límite dentro → aparece; cerrado antes de desde → no', async () => {
    const { agente } = await como();
    const antes = await crearTicket({
      creado_en: fecha('2031-02-01'),
      fecha_limite: fecha('2031-03-12'),
    });
    const dentro = await crearTicket({
      creado_en: fecha('2031-03-11'),
      fecha_limite: fecha('2031-03-13'),
    });
    const cerradoAntes = await crearTicket({
      estado: 'resuelto',
      creado_en: fecha('2031-02-01'),
      fecha_limite: fecha('2031-03-12'),
      cerrado_en: fecha('2031-03-05'),
    });
    const fuera = await crearTicket({
      creado_en: fecha('2031-02-01'),
      fecha_limite: fecha('2031-03-02'),
    });
    const r = await agente.get(ruta('2031-03-10', '2031-03-23'));
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(expect.arrayContaining([antes.id, dentro.id]));
    expect(ids(r)).not.toContain(cerradoAntes.id);
    expect(ids(r)).not.toContain(fuera.id); // su barra termina antes del rango y no está vencido
    const item = r.body.items.find((i: Item) => i.id === antes.id);
    expect(item).toMatchObject({ inicio: '2031-02-01', limite: '2031-03-12' });
  });

  it('sin inicio planificado parte en la fecha de creación; sin límite → limite null', async () => {
    const { agente } = await como();
    const t = await crearTicket({ creado_en: fecha('2031-03-11'), fecha_limite: null });
    const r = await agente.get(ruta('2031-03-10', '2031-03-23'));
    const item = r.body.items.find((i: Item) => i.id === t.id);
    expect(item).toMatchObject({ inicio: '2031-03-11', limite: null, vencido: false });
  });

  it('un vencido abierto con límite anterior a desde aparece con vencido: true y cuenta en vencidos', async () => {
    const { agente } = await como();
    const futuro = await crearTicket({ creado_en: dias(-1), fecha_limite: dias(1) });
    const t = await crearTicket({ creado_en: dias(-60), fecha_limite: dias(-40) });
    const hoy = hoySantiago();
    const r = await agente.get(ruta(hoy, hoy));
    const item = r.body.items.find((i: Item) => i.id === t.id);
    expect(item).toMatchObject({ vencido: true, cerrado: false });
    expect(r.body.vencidos).toBe(1);
    expect(r.body.items.map((i: Item) => i.id)).toEqual([t.id, futuro.id]); // vencidos primero
  });

  it('items traen responsables, cliente y OT vinculada; personas lista a los activos', async () => {
    const { agente, usuario } = await como();
    const inactivo = await crearUsuario({ activo: false });
    const cliente = await crearCliente();
    const t = await crearTicket({
      creado_en: fecha('2031-03-11'),
      fecha_limite: fecha('2031-03-13'),
      cliente_id: cliente.id,
      principal_id: usuario.id,
    });
    const ot = await crearOt(t.id, { tipo: 'interna', etapa: 'en_ejecucion' });
    const r = await agente.get(ruta('2031-03-10', '2031-03-23'));
    const item = r.body.items.find((i: { id: number }) => i.id === t.id);
    expect(item.responsable_id).toBe(usuario.id);
    expect(item.responsables).toEqual([
      expect.objectContaining({ id: usuario.id, principal: true }),
    ]);
    expect(item.cliente).toMatchObject({ id: cliente.id });
    expect(item.ot_vinculada).toEqual({ id: ot.id, codigo: ot.codigo, tipo: 'interna' });
    const personas = r.body.personas.map((p: { id: number }) => p.id);
    expect(personas).toContain(usuario.id);
    expect(personas).not.toContain(inactivo.id);
  });

  it('un ticket sin responsable tiene responsable_id null', async () => {
    const { agente } = await como();
    const t = await crearTicket({
      creado_en: fecha('2031-03-11'),
      fecha_limite: fecha('2031-03-13'),
    });
    const r = await agente.get(ruta('2031-03-10', '2031-03-23'));
    expect(r.body.items.find((i: Item) => i.id === t.id).responsable_id).toBeNull();
  });

  it('archivados no aparecen', async () => {
    const { agente } = await como();
    const t = await crearTicket({
      creado_en: fecha('2031-03-11'),
      fecha_limite: fecha('2031-03-13'),
      archivado_en: new Date(),
      estado: 'resuelto',
      cerrado_en: fecha('2031-03-12'),
    });
    const r = await agente.get(ruta('2031-03-10', '2031-03-23'));
    expect(ids(r)).not.toContain(t.id);
  });

  it('validación: rango > 62 días, hasta < desde y fechas no ISO → 400', async () => {
    const { agente } = await como();
    expect((await agente.get(ruta('2031-03-10', '2031-05-12'))).status).toBe(400);
    expect((await agente.get(ruta('2031-03-10', '2031-03-09'))).status).toBe(400);
    expect((await agente.get(ruta('10-03-2031', '2031-03-12'))).status).toBe(400);
    expect((await agente.get('/api/tickets/linea-de-tiempo')).status).toBe(400);
  });

  it('más de 500 items → 400 VALIDACION con hasta', async () => {
    const { agente } = await como();
    await dataSource.query(
      `INSERT INTO ticket (numero, codigo, asunto, origen, prioridad, estado, creado_en)
       SELECT 20000 + g, 'TK-' || (20000 + g), 'Masivo ' || g, 'externo', 'media', 'nuevo', '2031-03-11T15:00:00Z'
         FROM generate_series(1, 501) g`,
    );
    const r = await agente.get(ruta('2031-03-10', '2031-03-23'));
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('VALIDACION');
    expect(r.body.error.detalles).toMatchObject({ hasta: ['Acorta el rango'] });
  });

  it('lectura → 200 y sin sesión → 401', async () => {
    const { agente } = await como('lectura');
    expect((await agente.get(ruta('2031-03-10', '2031-03-16'))).status).toBe(200);
    const r = await request(app()).get(ruta('2031-03-10', '2031-03-16'));
    expect(r.status).toBe(401);
  });
});
