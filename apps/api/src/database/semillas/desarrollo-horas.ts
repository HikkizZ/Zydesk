import { dataSource } from '../../config/db.js';

// Semillas de la planilla de horas (spec fase 5 §10): semana actual de Sebastián Díaz (`sdiaz`) con las cifras
// del diseño y 2 h de Valentina Soto en OT-0215. Solo inserta lo que falta (nunca borra ni pisa): la fila de
// 3 h de OT-0218 la deja `desarrollo-ots.ts`. Las celdas en días futuros no se siembran (§4.5): si hoy es
// lunes, las del martes quedan fuera.

interface FilaSemilla {
  usuario: string;
  dia: number; // 0 = lunes de la semana actual
  destino: { ticket: number } | { ot: number; tarea?: number } | { descripcion: string };
  horas: number;
  fuera_de_horario?: boolean;
}

const REUNION = 'Reunión de equipo y coordinación';

// prettier-ignore
const FILAS: FilaSemilla[] = [
  { usuario: 'sdiaz', dia: 1, destino: { ot: 218, tarea: 1 }, horas: 1 },
  { usuario: 'sdiaz', dia: 0, destino: { ot: 217 }, horas: 2 },
  { usuario: 'sdiaz', dia: 1, destino: { ot: 217 }, horas: 2.5 },
  { usuario: 'sdiaz', dia: 0, destino: { ticket: 1026 }, horas: 1.5 },
  { usuario: 'sdiaz', dia: 1, destino: { ticket: 1049 }, horas: 0.5, fuera_de_horario: true },
  { usuario: 'sdiaz', dia: 0, destino: { descripcion: REUNION }, horas: 1 },
  { usuario: 'sdiaz', dia: 1, destino: { descripcion: REUNION }, horas: 0.5 },
  { usuario: 'vsoto', dia: 0, destino: { ot: 215 }, horas: 2 },
];

export async function sembrarHoras(personas: Map<string, number>): Promise<void> {
  const [{ lunes, hoy }] = await dataSource.query(
    `SELECT to_char(date_trunc('week', now() AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM-DD') AS lunes,
            to_char((now() AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM-DD') AS hoy`,
  );
  for (const f of FILAS) {
    const [{ fecha }] = await dataSource.query(
      `SELECT to_char($1::date + $2::int, 'YYYY-MM-DD') AS fecha`,
      [lunes, f.dia],
    );
    if (fecha > hoy) continue;

    let ticket_id: number | null = null;
    let ot_id: number | null = null;
    let tarea_id: number | null = null;
    let descripcion: string | null = null;
    if ('ticket' in f.destino) {
      const [t] = await dataSource.query(`SELECT id FROM ticket WHERE numero = $1`, [
        f.destino.ticket,
      ]);
      ticket_id = t.id;
    } else if ('ot' in f.destino) {
      const [o] = await dataSource.query(`SELECT id FROM ot WHERE numero = $1`, [f.destino.ot]);
      ot_id = o.id;
      if (f.destino.tarea !== undefined) {
        const [ta] = await dataSource.query(
          `SELECT id FROM tarea WHERE ot_id = $1 AND orden = $2`,
          [ot_id, f.destino.tarea],
        );
        tarea_id = ta.id;
      }
    } else {
      descripcion = f.destino.descripcion;
    }

    // La celda manual ya existe si coincide con lo que cubre `registro_horas_celda_manual_uq`
    await dataSource.query(
      `INSERT INTO registro_horas (usuario_id, fecha, ticket_id, ot_id, tarea_id, horas, fuera_de_horario, descripcion)
       SELECT $1, $2::date, $3::int, $4::int, $5::int, $6, $7, $8::text
        WHERE NOT EXISTS (
          SELECT 1 FROM registro_horas
           WHERE mensaje_id IS NULL AND usuario_id = $1 AND fecha = $2::date
             AND COALESCE(ticket_id, 0) = COALESCE($3::int, 0)
             AND COALESCE(ot_id, 0) = COALESCE($4::int, 0)
             AND COALESCE(tarea_id, 0) = COALESCE($5::int, 0)
             AND COALESCE(descripcion, '') = COALESCE($8::text, ''))`,
      [
        personas.get(f.usuario),
        fecha,
        ticket_id,
        ot_id,
        tarea_id,
        f.horas,
        f.fuera_de_horario === true,
        descripcion,
      ],
    );
  }
}
