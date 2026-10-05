import { describe, expect, it } from 'vitest';
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

type Agente = Awaited<ReturnType<typeof ingresarComo>>['agente'];

const app = () => crearApp({ comprobarBd: async () => true });

const hoy = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

// Cada caso trae su propia OT (con su cotización) y devuelve la cotización esperada en `datos.cotizacion_id`.
interface Escenario {
  usuario: { id: number };
  contacto: { id: number };
  ot: { id: number };
  cotizacion: { id: number } | null;
  plantilla: { id: number };
}

type Caso = {
  nombre: string;
  etapa: 'borrador' | 'cotizada';
  estado: 'borrador' | 'enviada' | null; // cotización previa de la OT
  conLineas: boolean;
  enviar: (a: Agente, e: Escenario) => Promise<{ status: number; body: { id?: number } }>;
  esperada: (e: Escenario, respuesta: { body: { id?: number } }) => number;
};

const CASOS: Caso[] = [
  {
    nombre: 'POST ots/:id/cotizaciones',
    etapa: 'borrador',
    estado: null,
    conLineas: false,
    enviar: (a, e) => a.post(`/api/ots/${e.ot.id}/cotizaciones`),
    esperada: (_e, r) => r.body.id!,
  },
  {
    nombre: 'PUT cotización',
    etapa: 'borrador',
    estado: 'borrador',
    conLineas: false,
    enviar: (a, e) =>
      a.put(`/api/cotizaciones/${e.cotizacion!.id}`).send({
        contacto_id: e.contacto.id,
        fecha_emision: hoy(),
        validez_dias: 30,
        moneda: 'CLP',
        valor_uf: null,
        aplica_iva: true,
        condiciones: null,
        nota_interna: null,
        lineas: [
          {
            tipo: 'servicio',
            descripcion: 'Servicio',
            cantidad: 1,
            unidad: 'un',
            precio_unitario: 1000,
            descuento_pct: 0,
          },
        ],
      }),
    esperada: (e) => e.cotizacion!.id,
  },
  {
    nombre: 'importar-horas',
    etapa: 'borrador',
    estado: 'borrador',
    conLineas: false,
    enviar: (a, e) => a.post(`/api/cotizaciones/${e.cotizacion!.id}/importar-horas`).send({}),
    esperada: (e) => e.cotizacion!.id,
  },
  {
    nombre: 'aplicar-plantilla',
    etapa: 'borrador',
    estado: 'borrador',
    conLineas: false,
    enviar: (a, e) =>
      a
        .post(`/api/cotizaciones/${e.cotizacion!.id}/aplicar-plantilla`)
        .send({ plantilla_id: e.plantilla.id }),
    esperada: (e) => e.cotizacion!.id,
  },
  {
    nombre: 'enviar',
    etapa: 'borrador',
    estado: 'borrador',
    conLineas: true,
    enviar: (a, e) => a.post(`/api/cotizaciones/${e.cotizacion!.id}/enviar`),
    esperada: (e) => e.cotizacion!.id,
  },
  {
    nombre: 'duplicar',
    etapa: 'cotizada',
    estado: 'enviada',
    conLineas: true,
    enviar: (a, e) => a.post(`/api/cotizaciones/${e.cotizacion!.id}/duplicar`),
    esperada: (_e, r) => r.body.id!,
  },
  {
    nombre: 'DELETE cotización',
    etapa: 'borrador',
    estado: 'borrador',
    conLineas: false,
    enviar: (a, e) => a.delete(`/api/cotizaciones/${e.cotizacion!.id}`) as never,
    esperada: (e) => e.cotizacion!.id,
  },
  {
    nombre: 'descargar.xlsx',
    etapa: 'cotizada',
    estado: 'enviada',
    conLineas: true,
    enviar: (a, e) => a.get(`/api/cotizaciones/${e.cotizacion!.id}/descargar.xlsx`) as never,
    esperada: (e) => e.cotizacion!.id,
  },
  {
    nombre: 'descargar.pdf',
    etapa: 'cotizada',
    estado: 'enviada',
    conLineas: true,
    enviar: (a, e) => a.get(`/api/cotizaciones/${e.cotizacion!.id}/descargar.pdf`) as never,
    esperada: (e) => e.cotizacion!.id,
  },
  {
    nombre: 'PUT aprobacion',
    etapa: 'cotizada',
    estado: 'enviada',
    conLineas: true,
    enviar: async (a, e) =>
      a.put(`/api/ots/${e.ot.id}/aprobacion`).send({
        contacto_id: e.contacto.id,
        fecha: '2026-09-28',
        forma: 'correo',
        archivo_id: (await crearArchivoPendiente(e.usuario.id)).id,
      }),
    esperada: (e) => e.cotizacion!.id,
  },
  {
    nombre: 'cambiar-etapa borrador (rechazo)',
    etapa: 'cotizada',
    estado: 'enviada',
    conLineas: true,
    enviar: (a, e) => a.post(`/api/ots/${e.ot.id}/cambiar-etapa`).send({ etapa: 'borrador' }),
    esperada: (e) => e.cotizacion!.id,
  },
];

const cuenta = async (ot_id: number): Promise<number> =>
  Number(
    (
      await dataSource.query(
        `SELECT count(*)::int AS n FROM evento WHERE entidad = 'ot' AND entidad_id = $1`,
        [String(ot_id)],
      )
    )[0].n,
  );

// Cobertura de eventos (ADR 0003, spec fase 4 §9): cada mutación de cotización deja su rastro en la OT.
describe('cobertura de eventos de cotización', () => {
  it.each(CASOS.map((c) => [c.nombre, c] as const))(
    '%s aumenta los eventos de la OT con el cotizacion_id esperado',
    async (_nombre, caso) => {
      await fijarTarifas({ hora_normal: { moneda: 'CLP', valor: 38000 } });
      const usuario = await crearUsuario({ rol: 'admin' });
      const { agente } = await ingresarComo(app(), usuario);
      const cliente = await crearCliente();
      const contacto = await crearContacto(cliente.id);
      const ticket = await crearTicket({ cliente_id: cliente.id });
      const ot = await crearOt(ticket.id, {
        tipo: 'facturable',
        etapa: caso.etapa,
        cliente_id: cliente.id,
      });
      const cotizacion =
        caso.estado === null
          ? null
          : await crearCotizacion(ot.id, {
              estado: caso.estado,
              contacto_id: contacto.id,
              lineas: caso.conLineas ? [{ cantidad: 2, precio_unitario: 38000 }] : [],
            });
      await crearTarea({ ot_id: ot.id }, { horas_estimadas: 2 });
      const plantilla = await crearPlantilla({ lineas: [{ unidad: 'un', precio_unitario: 100 }] });
      const escenario: Escenario = { usuario, contacto, ot, cotizacion, plantilla };

      const antes = await cuenta(ot.id);
      const auditoriasAntes = Number(
        (
          await dataSource.query(
            `SELECT count(*)::int AS n FROM auditoria WHERE accion = 'exportacion'`,
          )
        )[0].n,
      );
      const r = await caso.enviar(agente, escenario);
      expect([200, 201, 204]).toContain(r.status);
      expect(await cuenta(ot.id)).toBeGreaterThan(antes);

      const esperado = caso.esperada(escenario, r);
      const distintos = await dataSource.query(
        `SELECT DISTINCT datos->>'cotizacion_id' AS id FROM evento
          WHERE entidad = 'ot' AND entidad_id = $1 AND datos ? 'cotizacion_id'`,
        [String(ot.id)],
      );
      expect(distintos.map((d: { id: string }) => Number(d.id))).toContain(esperado);

      const descarga = caso.nombre.startsWith('descargar');
      const auditorias = Number(
        (
          await dataSource.query(
            `SELECT count(*)::int AS n FROM auditoria WHERE accion = 'exportacion'`,
          )
        )[0].n,
      );
      expect(auditorias - auditoriasAntes).toBe(descarga ? 1 : 0);
    },
  );

  it('las lecturas no crean eventos ni auditoría', async () => {
    const usuario = await crearUsuario({ rol: 'lectura' });
    const { agente } = await ingresarComo(app(), usuario);
    const cliente = await crearCliente();
    const ticket = await crearTicket({ cliente_id: cliente.id });
    const ot = await crearOt(ticket.id, {
      tipo: 'facturable',
      etapa: 'cotizada',
      cliente_id: cliente.id,
    });
    const c = await crearCotizacion(ot.id, {
      estado: 'enviada',
      lineas: [{ cantidad: 1, precio_unitario: 1000 }],
    });
    const conteos = () =>
      dataSource.query(
        `SELECT (SELECT count(*) FROM evento)::int AS eventos, (SELECT count(*) FROM auditoria)::int AS auditoria`,
      );
    const antes = await conteos();
    for (const url of [
      '/api/cotizaciones',
      `/api/cotizaciones/${c.id}`,
      `/api/ots/${ot.id}`,
      '/api/ots',
    ]) {
      expect((await agente.get(url)).status).toBe(200);
    }
    expect(await conteos()).toEqual(antes);
  });
});
