import { lunesDe } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { fijarHorasDeMensaje } from '../mensajes/mensajes.acceso.js';
import { bloquearOt } from '../ots/ots.acceso.js';
import { bloquearTicket } from '../tickets/tickets.service.js';
import { cargarPlanilla } from './horas.consulta.js';
import {
  hoyEnSantiago,
  type HorasQueryDatos,
  type PlanillaSemanalDatos,
  type RegistroHorasEditarDatos,
  type RegistroHorasEntradaDatos,
  type RegistroHorasSalidaDatos,
} from './horas.tipos.js';
import { RegistroHoras } from './registro-horas.entity.js';

// ---- Planilla ----

// La propia con sesión; la de otra persona solo con `horas.ver_todas` (§4.9).
export async function obtenerPlanilla(
  actor: UsuarioSesion,
  q: HorasQueryDatos,
): Promise<PlanillaSemanalDatos> {
  const usuario_id = q.usuario_id ?? actor.id;
  if (usuario_id !== actor.id && !actor.permisos.includes('horas.ver_todas')) {
    throw new ErrorApp('SIN_PERMISO', 'No tienes permiso para ver las horas de otra persona');
  }
  const lunes = lunesDe(q.semana ?? hoyEnSantiago());
  return cargarPlanilla(
    dataSource.manager,
    usuario_id,
    lunes,
    actor.id,
    actor.permisos.includes('tickets.editar'),
  );
}

// ---- Registro desde el redactor ----

// B5 (mínimo): el redactor registra las horas en la planilla de hoy; la planilla completa es Fase 5.
export async function registrarHorasDesdeMensaje(
  tx: EntityManager,
  d: { usuario_id: number; mensaje_id: number; horas: number } & (
    { ticket_id: number } | { ot_id: number }
  ),
): Promise<void> {
  await tx.insert(RegistroHoras, {
    usuario_id: d.usuario_id,
    fecha: hoyEnSantiago(),
    ticket_id: 'ticket_id' in d ? d.ticket_id : null,
    ot_id: 'ot_id' in d ? d.ot_id : null,
    mensaje_id: d.mensaje_id,
    horas: d.horas,
    fuera_de_horario: false,
    descripcion: null,
  });
}

// Las tareas se movieron a otra OT: sus horas se trabajaron en la OT original y conservan `ot_id` (spec §5.5).
// Mismo `tx` del llamador, que ya tiene bloqueadas las OT.
export async function desvincularTareas(tx: EntityManager, tarea_ids: number[]): Promise<void> {
  if (tarea_ids.length === 0) return;
  await tx.query(
    `UPDATE registro_horas SET tarea_id = NULL, actualizado_en = now() WHERE tarea_id = ANY($1::int[])`,
    [tarea_ids],
  );
}

// ---- Mutaciones de filas (§5.2 y §5.3) ----

const errorValidacion = (errores: Record<string, string[]>): ErrorApp =>
  new ErrorApp('VALIDACION', 'Datos inválidos', errores);

const COLUMNAS = `id, usuario_id, fecha::text AS fecha, ticket_id, ot_id, tarea_id, mensaje_id, descripcion,
  horas::float8 AS horas, fuera_de_horario, creado_en, actualizado_en`;

interface FilaRegistro {
  id: number;
  usuario_id: number;
  fecha: string;
  ticket_id: number | null;
  ot_id: number | null;
  tarea_id: number | null;
  mensaje_id: number | null;
  descripcion: string | null;
  horas: number;
  fuera_de_horario: boolean;
  creado_en: Date;
  actualizado_en: Date;
}

const aSalida = (f: FilaRegistro): RegistroHorasSalidaDatos => ({
  ...f,
  creado_en: f.creado_en.toISOString(),
  actualizado_en: f.actualizado_en.toISOString(),
});

function exigirNoFutura(fecha: string): void {
  if (fecha > hoyEnSantiago()) {
    throw errorValidacion({ fecha: ['No se registran horas a futuro'] });
  }
}

// Bloquea el ticket o la OT de la fila (§1.2); una OT final → 409 (ADR 0024.2), comprobado tras el FOR UPDATE.
// `comoValidacion`: un destino inexistente es 400 (entrada nueva) y no 404.
async function bloquearDestino(
  tx: EntityManager,
  d: { ticket_id: number | null; ot_id: number | null },
  comoValidacion: boolean,
): Promise<void> {
  try {
    if (d.ticket_id !== null) await bloquearTicket(tx, d.ticket_id);
    if (d.ot_id !== null) {
      const ot = await bloquearOt(tx, d.ot_id);
      if (ot.final) {
        throw new ErrorApp('OT_CERRADA', 'La OT está cerrada o cancelada', {
          horas: ['No se registran horas en una OT cerrada'],
        });
      }
    }
  } catch (err) {
    if (comoValidacion && err instanceof ErrorApp && err.codigo === 'NO_ENCONTRADO') {
      throw errorValidacion(
        d.ticket_id !== null
          ? { ticket_id: ['Ticket no encontrado'] }
          : { ot_id: ['OT no encontrada'] },
      );
    }
    throw err;
  }
}

async function exigirTareaDeOt(tx: EntityManager, tarea_id: number, ot_id: number): Promise<void> {
  const filas: unknown[] = await tx.query(`SELECT 1 FROM tarea WHERE id = $1 AND ot_id = $2`, [
    tarea_id,
    ot_id,
  ]);
  if (filas.length === 0) throw errorValidacion({ tarea_id: ['La tarea no pertenece a la OT'] });
}

interface Celda {
  usuario_id: number;
  fecha: string;
  ticket_id: number | null;
  ot_id: number | null;
  tarea_id: number | null;
  descripcion: string | null;
}

// Otra fila manual en la misma celda (comprobación explícita; el índice único es la red).
async function celdaManualOcupada(
  m: Pick<EntityManager, 'query'>,
  c: Celda,
  exceptoId: number,
): Promise<number | null> {
  const [f]: { id: number }[] = await m.query(
    `SELECT id FROM registro_horas
      WHERE usuario_id = $1 AND fecha = $2 AND COALESCE(ticket_id, 0) = $3 AND COALESCE(ot_id, 0) = $4
        AND COALESCE(tarea_id, 0) = $5 AND COALESCE(descripcion, '') = $6 AND mensaje_id IS NULL AND id <> $7`,
    [
      c.usuario_id,
      c.fecha,
      c.ticket_id ?? 0,
      c.ot_id ?? 0,
      c.tarea_id ?? 0,
      c.descripcion ?? '',
      exceptoId,
    ],
  );
  return f?.id ?? null;
}

const conflictoCelda = (registro_id?: number): ErrorApp =>
  new ErrorApp(
    'CONFLICTO',
    'Ya hay horas en esa celda: edítalas',
    registro_id === undefined ? undefined : { registro_id },
  );

const esCeldaDuplicada = (err: unknown): boolean => {
  const o = (err as { driverError?: { code?: string; constraint?: string } }).driverError;
  return o?.code === '23505' && o.constraint === 'registro_horas_celda_manual_uq';
};

export async function crearRegistro(
  actor: UsuarioSesion,
  e: RegistroHorasEntradaDatos,
): Promise<RegistroHorasSalidaDatos> {
  const conDestino = e.ticket_id !== null || e.ot_id !== null;
  const descripcion = conDestino ? null : (e.descripcion?.trim() ?? null);
  exigirNoFutura(e.fecha);

  const celda: Celda = {
    usuario_id: actor.id,
    fecha: e.fecha,
    ticket_id: e.ticket_id,
    ot_id: e.ot_id,
    tarea_id: e.tarea_id,
    descripcion,
  };
  try {
    return await enTransaccion(async (tx) => {
      await bloquearDestino(tx, e, true);
      if (e.tarea_id !== null) await exigirTareaDeOt(tx, e.tarea_id, e.ot_id!);
      const existente = await celdaManualOcupada(tx, celda, 0);
      if (existente !== null) throw conflictoCelda(existente);
      const [f]: FilaRegistro[] = await tx.query(
        `INSERT INTO registro_horas (usuario_id, fecha, ticket_id, ot_id, tarea_id, mensaje_id, descripcion, horas, fuera_de_horario)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8)
         RETURNING ${COLUMNAS}`,
        [
          actor.id,
          e.fecha,
          e.ticket_id,
          e.ot_id,
          e.tarea_id,
          descripcion,
          e.horas,
          e.fuera_de_horario,
        ],
      );
      logger.debug(
        {
          registro_id: f!.id,
          usuario_id: actor.id,
          ticket_id: e.ticket_id,
          ot_id: e.ot_id,
          tarea_id: e.tarea_id,
        },
        'horas registradas',
      );
      return aSalida(f!);
    });
  } catch (err) {
    if (esCeldaDuplicada(err)) {
      throw conflictoCelda((await celdaManualOcupada(dataSource.manager, celda, 0)) ?? undefined);
    }
    throw err;
  }
}

// Fila propia (404 / 403) con su destino bloqueado antes que ella (§1.2); devuelve la fila ya bloqueada.
async function bloquearRegistroPropio(
  tx: EntityManager,
  actor: UsuarioSesion,
  id: number,
): Promise<FilaRegistro> {
  const [previa]: { usuario_id: number; ticket_id: number | null; ot_id: number | null }[] =
    await tx.query(`SELECT usuario_id, ticket_id, ot_id FROM registro_horas WHERE id = $1`, [id]);
  if (!previa) throw new ErrorApp('NO_ENCONTRADO', 'Registro de horas no encontrado');
  if (previa.usuario_id !== actor.id) {
    throw new ErrorApp('SIN_PERMISO', 'Solo puedes modificar tus propias horas');
  }
  await bloquearDestino(tx, previa, false);
  const [fila]: FilaRegistro[] = await tx.query(
    `SELECT ${COLUMNAS} FROM registro_horas WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!fila) throw new ErrorApp('NO_ENCONTRADO', 'Registro de horas no encontrado');
  return fila;
}

export async function editarRegistro(
  actor: UsuarioSesion,
  id: number,
  e: RegistroHorasEditarDatos,
): Promise<RegistroHorasSalidaDatos> {
  try {
    return await enTransaccion(async (tx) => {
      const f = await bloquearRegistroPropio(tx, actor, id);
      const sinTicket = f.ticket_id === null && f.ot_id === null;
      if (e.fecha !== undefined) exigirNoFutura(e.fecha);
      if (e.tarea_id !== undefined && e.tarea_id !== null) {
        if (f.ot_id === null) throw errorValidacion({ tarea_id: ['La tarea requiere una OT'] });
        await exigirTareaDeOt(tx, e.tarea_id, f.ot_id);
      }
      if (sinTicket && e.descripcion === null) {
        throw errorValidacion({ descripcion: ['Describe el trabajo sin ticket'] });
      }

      const nuevo = {
        fecha: e.fecha ?? f.fecha,
        tarea_id: e.tarea_id === undefined ? f.tarea_id : e.tarea_id,
        descripcion: sinTicket && e.descripcion !== undefined ? e.descripcion : f.descripcion,
        horas: e.horas ?? f.horas,
        fuera_de_horario: e.fuera_de_horario ?? f.fuera_de_horario,
      };
      if (
        f.mensaje_id === null &&
        (nuevo.fecha !== f.fecha ||
          nuevo.tarea_id !== f.tarea_id ||
          nuevo.descripcion !== f.descripcion)
      ) {
        const otra = await celdaManualOcupada(
          tx,
          {
            usuario_id: f.usuario_id,
            fecha: nuevo.fecha,
            ticket_id: f.ticket_id,
            ot_id: f.ot_id,
            tarea_id: nuevo.tarea_id,
            descripcion: nuevo.descripcion,
          },
          f.id,
        );
        if (otra !== null) throw conflictoCelda(otra);
      }

      // TypeORM devuelve [filas, cantidad] en los UPDATE ... RETURNING
      const [[actualizada]] = (await tx.query(
        `UPDATE registro_horas
            SET fecha = $2, tarea_id = $3, descripcion = $4, horas = $5, fuera_de_horario = $6, actualizado_en = now()
          WHERE id = $1
          RETURNING ${COLUMNAS}`,
        [id, nuevo.fecha, nuevo.tarea_id, nuevo.descripcion, nuevo.horas, nuevo.fuera_de_horario],
      )) as [FilaRegistro[], number];
      if (f.mensaje_id !== null && nuevo.horas !== f.horas) {
        await fijarHorasDeMensaje(tx, f.mensaje_id, nuevo.horas);
      }
      logger.debug(
        {
          registro_id: id,
          usuario_id: actor.id,
          ticket_id: f.ticket_id,
          ot_id: f.ot_id,
          tarea_id: nuevo.tarea_id,
        },
        'horas editadas',
      );
      return aSalida(actualizada!);
    });
  } catch (err) {
    if (esCeldaDuplicada(err)) throw conflictoCelda();
    throw err;
  }
}

export async function eliminarRegistro(actor: UsuarioSesion, id: number): Promise<void> {
  await enTransaccion(async (tx) => {
    const f = await bloquearRegistroPropio(tx, actor, id);
    await tx.query(`DELETE FROM registro_horas WHERE id = $1`, [id]);
    if (f.mensaje_id !== null) await fijarHorasDeMensaje(tx, f.mensaje_id, null);
    logger.debug(
      {
        registro_id: id,
        usuario_id: actor.id,
        ticket_id: f.ticket_id,
        ot_id: f.ot_id,
        tarea_id: f.tarea_id,
      },
      'horas eliminadas',
    );
  });
}
