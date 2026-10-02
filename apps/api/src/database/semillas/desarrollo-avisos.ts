import type { EntityManager } from 'typeorm';
import { construirAviso } from '../../avisos/textos.js';
import { dataSource } from '../../config/db.js';
import type { EventoPendiente } from '../../core/eventos/dominio.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { instante } from './desarrollo-tickets.js';

// Semillas de avisos (spec fase 6 §20): los avisos de la pantalla "Avisos" para Camila Rojas (`crojas`) y tres
// para Sebastián Díaz (`sdiaz`). Los textos salen de `avisos/textos.ts` a partir de las entidades ya
// sembradas, como los escribiría el despachador; aquí se insertan directo (sin publicar eventos de dominio).
// Idempotente por persona: si ya tiene avisos no se toca nada (nunca borra). No siembra `vinculo_telegram`
// ni `codigo_vinculo` (dependen de un chat real).

interface AvisoSemilla {
  evento: EventoPendiente;
  cuando: Date;
  leido: boolean;
  texto?: string; // solo cuando el diseño pide un texto distinto del que generaría `textos.ts`
}

const UN_MINUTO = 60_000;

// Cada instante queda estrictamente anterior al de arriba: la lista conserva el orden del diseño aunque la
// semilla corra de madrugada (p. ej. «hoy 09:30» no puede ser posterior a «hace 25 min»).
function enOrden(objetivos: Date[]): Date[] {
  const salida: Date[] = [];
  for (const [i, t] of objetivos.entries()) {
    const tope = i === 0 ? Infinity : salida[i - 1]!.getTime() - UN_MINUTO;
    salida.push(new Date(Math.min(t.getTime(), tope)));
  }
  return salida;
}

async function idDe(m: EntityManager, tabla: 'ticket' | 'ot', codigo: string): Promise<number> {
  const [f] = await m.query(`SELECT id FROM ${tabla} WHERE codigo = $1`, [codigo]);
  return f.id as number;
}

async function mensajeDe(
  m: EntityManager,
  ticket_id: number,
  tipo: 'seguimiento' | 'nota_interna',
  autor_id: number,
): Promise<number> {
  const [f] = await m.query(
    `SELECT id FROM mensaje WHERE ticket_id = $1 AND tipo = $2 AND autor_id = $3 ORDER BY id LIMIT 1`,
    [ticket_id, tipo, autor_id],
  );
  return f.id as number;
}

async function limiteDe(m: EntityManager, ticket_id: number): Promise<string> {
  const [f] = await m.query(`SELECT fecha_limite FROM ticket WHERE id = $1`, [ticket_id]);
  return (f.fecha_limite as Date).toISOString();
}

async function insertar(
  tx: EntityManager,
  usuario_id: number,
  avisos: AvisoSemilla[],
): Promise<void> {
  for (const a of avisos) {
    const plan = await construirAviso(tx, a.evento, a.cuando);
    if (!plan) continue;
    await tx.query(
      `INSERT INTO aviso (usuario_id, evento, tipo, clave, texto, enlace, entidad, entidad_id, datos, actor_id,
                          en_app, leido_en, creado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, true, $11, $12)
       ON CONFLICT (usuario_id, clave) WHERE clave IS NOT NULL DO NOTHING`,
      [
        usuario_id,
        plan.evento,
        plan.tipo,
        plan.clave,
        a.texto ?? plan.texto,
        plan.enlace,
        plan.entidad,
        plan.entidad_id,
        JSON.stringify(plan.datos),
        plan.actor_id,
        a.leido ? a.cuando : null,
        a.cuando,
      ],
    );
  }
}

async function sinAvisos(usuario_id: number): Promise<boolean> {
  const [{ n }] = await dataSource.query(
    `SELECT count(*)::int AS n FROM aviso WHERE usuario_id = $1`,
    [usuario_id],
  );
  return n === 0;
}

export async function sembrarAvisos(personas: Map<string, number>): Promise<void> {
  const p = (u: string) => personas.get(u)!;
  const cr = p('crojas');
  const sd = p('sdiaz');

  if (await sinAvisos(cr)) {
    await enTransaccion(async (tx) => {
      const t1048 = await idDe(tx, 'ticket', 'TK-1048');
      const t1051 = await idDe(tx, 'ticket', 'TK-1051');
      const t1028 = await idDe(tx, 'ticket', 'TK-1028');
      const o216 = await idDe(tx, 'ot', 'OT-0216');
      const o219 = await idDe(tx, 'ot', 'OT-0219');
      const ahora = Date.now();
      const [c1, c2, c3, c4, c5, c6, c7] = enOrden([
        new Date(ahora - 25 * UN_MINUTO),
        new Date(ahora - 60 * UN_MINUTO),
        new Date(ahora - 120 * UN_MINUTO),
        await instante(tx, 0, '09:30'),
        await instante(tx, 1, '18:10'),
        await instante(tx, 4, '10:00'), // 28 sep en el diseño (hoy = 2 oct)
        await instante(tx, 5, '10:00'), // 27 sep
      ]) as [Date, Date, Date, Date, Date, Date, Date];
      await insertar(tx, cr, [
        {
          evento: [
            'mencion',
            {
              mensaje_id: await mensajeDe(tx, t1048, 'nota_interna', sd),
              ticket_id: t1048,
              ot_id: null,
              tipo: 'nota_interna',
              usuario_ids: [cr],
              actor_id: sd,
            },
          ],
          cuando: c1,
          leido: false,
        },
        {
          evento: [
            'ticket.vence_pronto',
            { ticket_id: t1051, fecha_limite: await limiteDe(tx, t1051) },
          ],
          cuando: c2,
          leido: false,
        },
        {
          evento: ['ot.por_aprobar', { ot_id: o219, aprobador_id: cr }],
          cuando: c3,
          leido: false,
          // el diseño la pide Valentina; el evento no trae al solicitante (en la semilla la OT la creó Camila)
          texto: 'Valentina Soto te pidió aprobar la OT-0219 (interna)',
        },
        {
          evento: [
            'ticket.seguimiento_nuevo',
            {
              ticket_id: t1048,
              mensaje_id: await mensajeDe(tx, t1048, 'seguimiento', sd),
              actor_id: sd,
              copiado: false,
            },
          ],
          cuando: c4,
          leido: true,
        },
        { evento: ['ot.por_facturar', { ot_id: o216 }], cuando: c5, leido: true },
        {
          evento: [
            'ticket.estado_cambiado',
            {
              ticket_id: t1028,
              estado_anterior: 'en_curso',
              estado: 'en_espera',
              actor_id: p('treyes'),
            },
          ],
          cuando: c6,
          leido: true,
        },
        {
          evento: [
            'ticket.seguidor_agregado',
            { ticket_id: t1048, usuario_ids: [cr], actor_id: null },
          ],
          cuando: c7,
          leido: true,
        },
      ]);
    });
  }

  if (await sinAvisos(sd)) {
    await enTransaccion(async (tx) => {
      const t1048 = await idDe(tx, 'ticket', 'TK-1048');
      const [asignado, ahora0800] = await Promise.all([
        instante(tx, 2, '17:21'),
        instante(tx, 0, '08:00'),
      ]);
      const mencionado = new Date(asignado.getTime() - UN_MINUTO);
      const vence = new Date(Math.min(ahora0800.getTime(), Date.now() - UN_MINUTO));
      await insertar(tx, sd, [
        {
          evento: [
            'ticket.vence_pronto',
            { ticket_id: t1048, fecha_limite: await limiteDe(tx, t1048) },
          ],
          cuando: vence,
          leido: true,
        },
        {
          evento: [
            'mencion',
            {
              mensaje_id: await mensajeDe(tx, t1048, 'nota_interna', cr),
              ticket_id: t1048,
              ot_id: null,
              tipo: 'nota_interna',
              usuario_ids: [sd],
              actor_id: cr,
            },
          ],
          cuando: mencionado,
          leido: false,
        },
        {
          evento: ['ticket.asignado', { ticket_id: t1048, usuario_ids: [sd], actor_id: cr }],
          cuando: asignado,
          leido: true,
        },
      ]);
    });
  }

  // Camila no recibe por Telegram el aviso de «nuevo seguimiento»: una fila explícita distinta del defecto
  await dataSource.query(
    `INSERT INTO preferencia_aviso (usuario_id, evento, canal, activo)
     VALUES ($1, 'seguimiento', 'telegram', false) ON CONFLICT DO NOTHING`,
    [cr],
  );
}
