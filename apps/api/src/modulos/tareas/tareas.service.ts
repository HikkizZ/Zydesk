import {
  iniciales,
  type TareaEditarEntrada,
  type TareaEntrada,
  type TareaSalida,
} from '@zydesk/shared';
import type { z } from 'zod';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { publicarPendientes, type EventoPendiente } from '../../core/eventos/dominio.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarEvento } from '../../core/historial/evento.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { desvincularTareas } from '../horas/horas.service.js';
import { bloquearOt, existeOt, otCerrada, registrarActividadEnOt } from '../ots/ots.acceso.js';
import { Ticket } from '../tickets/ticket.entity.js';
import { bloquearTicket, registrarActividadEnTicket } from '../tickets/tickets.service.js';

export type TareaEntradaDatos = z.infer<typeof TareaEntrada>;
export type TareaEditarEntradaDatos = z.infer<typeof TareaEditarEntrada>;
export type TareaSalidaDatos = z.infer<typeof TareaSalida>;

interface FilaTarea {
  id: number;
  ticket_id: number | null;
  ot_id: number | null;
  horas_estimadas: number | null;
  horas_reales: number | null;
  horas_registradas: number;
  titulo: string;
  fecha: string | null;
  hecha: boolean;
  hecha_en: Date | null;
  orden: number;
  creado_en: Date;
  actualizado_en: Date;
  vencida: boolean;
  responsable_id: number | null;
  responsable_nombre: string | null;
  responsable_color: string | null;
}

// Σ de registro_horas con esa tarea (derivado: no escribe `horas_reales`, spec fase 5 §4.7); 0 en tareas de ticket.
export const SQL_HORAS_REGISTRADAS = `COALESCE((SELECT sum(rh.horas) FROM registro_horas rh WHERE rh.tarea_id = t.id), 0)::float8`;

const SELECT_TAREA = `
  SELECT t.id, t.ticket_id, t.ot_id, t.horas_estimadas::float8 AS horas_estimadas,
         t.horas_reales::float8 AS horas_reales, ${SQL_HORAS_REGISTRADAS} AS horas_registradas,
         t.titulo, t.fecha::text AS fecha, t.hecha, t.hecha_en, t.orden,
         t.creado_en, t.actualizado_en,
         (t.fecha IS NOT NULL AND t.fecha < (now() AT TIME ZONE 'America/Santiago')::date AND NOT t.hecha) AS vencida,
         u.id AS responsable_id, u.nombre AS responsable_nombre, u.color_avatar AS responsable_color
    FROM tarea t LEFT JOIN usuario u ON u.id = t.responsable_id`;

function aSalida(t: FilaTarea): TareaSalidaDatos {
  return {
    id: t.id,
    ticket_id: t.ticket_id,
    ot_id: t.ot_id,
    horas_estimadas: t.horas_estimadas,
    horas_reales: t.horas_reales,
    horas_registradas: t.horas_registradas,
    titulo: t.titulo,
    responsable:
      t.responsable_id === null
        ? null
        : {
            id: t.responsable_id,
            nombre: t.responsable_nombre ?? '',
            iniciales: iniciales(t.responsable_nombre ?? ''),
            color_avatar: t.responsable_color ?? '',
          },
    fecha: t.fecha,
    hecha: t.hecha,
    hecha_en: t.hecha_en ? t.hecha_en.toISOString() : null,
    orden: t.orden,
    vencida: t.vencida,
    creado_en: t.creado_en.toISOString(),
    actualizado_en: t.actualizado_en.toISOString(),
  };
}

async function cargarTarea(m: EntityManager, id: number): Promise<TareaSalidaDatos> {
  const [f]: FilaTarea[] = await m.query(`${SELECT_TAREA} WHERE t.id = $1`, [id]);
  if (!f) throw new ErrorApp('NO_ENCONTRADO', 'Tarea no encontrada');
  return aSalida(f);
}

const ticketCerrado = (): ErrorApp =>
  new ErrorApp('TICKET_CERRADO', 'Reabre el ticket para editarlo');

const soloOt = (campo: 'horas_estimadas' | 'horas_reales'): ErrorApp =>
  new ErrorApp('VALIDACION', 'Datos inválidos', { [campo]: ['Solo en tareas de OT'] });

const textoHoras = (h: number | null): string | null => (h === null ? null : `${h} h`);

// Nombre del responsable; 400 si no existe o está inactivo.
async function nombreResponsable(tx: EntityManager, id: number | null): Promise<string | null> {
  if (id === null) return null;
  const [u]: { nombre: string }[] = await tx.query(
    `SELECT nombre FROM usuario WHERE id = $1 AND activo`,
    [id],
  );
  if (!u) {
    throw new ErrorApp('VALIDACION', 'Datos inválidos', {
      responsable_id: ['No existe o está inactivo'],
    });
  }
  return u.nombre;
}

// ---- Listar ----

export async function listarTareas(ticket_id: number): Promise<TareaSalidaDatos[]> {
  const m = dataSource.manager;
  if (!(await m.existsBy(Ticket, { id: ticket_id }))) {
    throw new ErrorApp('NO_ENCONTRADO', 'Ticket no encontrado');
  }
  const filas: FilaTarea[] = await m.query(
    `${SELECT_TAREA} WHERE t.ticket_id = $1 ORDER BY t.orden, t.id`,
    [ticket_id],
  );
  return filas.map(aSalida);
}

export async function listarTareasDeOt(ot_id: number): Promise<TareaSalidaDatos[]> {
  const m = dataSource.manager;
  if (!(await existeOt(m, ot_id))) throw new ErrorApp('NO_ENCONTRADO', 'OT no encontrada');
  const filas: FilaTarea[] = await m.query(
    `${SELECT_TAREA} WHERE t.ot_id = $1 ORDER BY t.orden, t.id`,
    [ot_id],
  );
  return filas.map(aSalida);
}

// ---- Crear ----

export async function crearTarea(
  actor: UsuarioSesion,
  ticket_id: number,
  e: TareaEntradaDatos,
): Promise<TareaSalidaDatos> {
  if (e.horas_estimadas !== null) throw soloOt('horas_estimadas');
  const pendientes: EventoPendiente[] = [];
  const salida = await enTransaccion(async (tx) => {
    const t = await bloquearTicket(tx, ticket_id);
    if (t.cerrado_en !== null) throw ticketCerrado();
    const responsable = await nombreResponsable(tx, e.responsable_id);

    const [fila]: { id: number }[] = await tx.query(
      `INSERT INTO tarea (ticket_id, titulo, responsable_id, fecha, orden, creado_por)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(max(orden), 0) + 1 FROM tarea WHERE ticket_id = $1), $5)
       RETURNING id`,
      [ticket_id, e.titulo, e.responsable_id, e.fecha, actor.id],
    );
    const id = fila!.id;
    await registrarEvento(tx, {
      entidad: 'ticket',
      entidad_id: ticket_id,
      actor,
      accion: 'tarea_creada',
      datos: { tarea_id: id, titulo: e.titulo, responsable },
    });
    await registrarActividadEnTicket(tx, ticket_id);
    if (e.responsable_id !== null && e.responsable_id !== actor.id) {
      pendientes.push([
        'tarea.asignada',
        { tarea_id: id, ticket_id, ot_id: null, usuario_id: e.responsable_id, actor_id: actor.id },
      ]);
    }
    return cargarTarea(tx, id);
  });
  publicarPendientes(pendientes);
  return salida;
}

export async function crearTareaDeOt(
  actor: UsuarioSesion,
  ot_id: number,
  e: TareaEntradaDatos,
): Promise<TareaSalidaDatos> {
  const pendientes: EventoPendiente[] = [];
  const salida = await enTransaccion(async (tx) => {
    const ot = await bloquearOt(tx, ot_id);
    if (ot.final) throw otCerrada();
    const responsable = await nombreResponsable(tx, e.responsable_id);

    const [fila]: { id: number }[] = await tx.query(
      `INSERT INTO tarea (ot_id, titulo, responsable_id, fecha, horas_estimadas, orden, creado_por)
       VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(max(orden), 0) + 1 FROM tarea WHERE ot_id = $1), $6)
       RETURNING id`,
      [ot_id, e.titulo, e.responsable_id, e.fecha, e.horas_estimadas, actor.id],
    );
    const id = fila!.id;
    await registrarEvento(tx, {
      entidad: 'ot',
      entidad_id: ot_id,
      actor,
      accion: 'tarea_creada',
      datos: { tarea_id: id, titulo: e.titulo, responsable, horas_estimadas: e.horas_estimadas },
    });
    await registrarActividadEnOt(tx, ot_id);
    if (e.responsable_id !== null && e.responsable_id !== actor.id) {
      pendientes.push([
        'tarea.asignada',
        { tarea_id: id, ticket_id: null, ot_id, usuario_id: e.responsable_id, actor_id: actor.id },
      ]);
    }
    return cargarTarea(tx, id);
  });
  publicarPendientes(pendientes);
  return salida;
}

// ---- Editar / marcar ----

// Toma el ticket o la OT de la tarea antes que la tarea (mismo orden de bloqueo que el resto de la API).
async function bloquearTareaYDestino(
  tx: EntityManager,
  id: number,
): Promise<{ tarea: FilaTarea; cerrado: boolean }> {
  const [previa]: { ticket_id: number | null; ot_id: number | null }[] = await tx.query(
    `SELECT ticket_id, ot_id FROM tarea WHERE id = $1`,
    [id],
  );
  if (!previa) throw new ErrorApp('NO_ENCONTRADO', 'Tarea no encontrada');
  const cerrado =
    previa.ticket_id !== null
      ? (await bloquearTicket(tx, previa.ticket_id)).cerrado_en !== null
      : (await bloquearOt(tx, previa.ot_id!)).final;
  const [tarea]: FilaTarea[] = await tx.query(`${SELECT_TAREA} WHERE t.id = $1 FOR UPDATE OF t`, [
    id,
  ]);
  if (!tarea) throw new ErrorApp('NO_ENCONTRADO', 'Tarea no encontrada');
  return { tarea, cerrado };
}

// Entidad dueña de la tarea, para el evento y la actividad
const duenoDe = (t: FilaTarea): { entidad: 'ticket' | 'ot'; entidad_id: number } =>
  t.ot_id !== null
    ? { entidad: 'ot', entidad_id: t.ot_id }
    : { entidad: 'ticket', entidad_id: t.ticket_id! };

async function registrarActividad(tx: EntityManager, t: FilaTarea): Promise<void> {
  if (t.ot_id !== null) await registrarActividadEnOt(tx, t.ot_id);
  else await registrarActividadEnTicket(tx, t.ticket_id!);
}

export async function editarTarea(
  actor: UsuarioSesion,
  id: number,
  e: TareaEditarEntradaDatos,
): Promise<TareaSalidaDatos> {
  const pendientes: EventoPendiente[] = [];
  const salida = await enTransaccion(async (tx) => {
    const { tarea, cerrado } = await bloquearTareaYDestino(tx, id);
    const esOt = tarea.ot_id !== null;
    if (!esOt) {
      if (e.horas_estimadas !== undefined && e.horas_estimadas !== null) {
        throw soloOt('horas_estimadas');
      }
      if (e.horas_reales !== undefined && e.horas_reales !== null) throw soloOt('horas_reales');
    }

    // Cambios reales de título, responsable, fecha y horas; marcar/desmarcar se permite con el destino cerrado
    const cambios: Record<string, [string | null, string | null]> = {};
    const sets: string[] = [];
    const valores: unknown[] = [id];
    const poner = (columna: string, valor: unknown): void => {
      valores.push(valor);
      sets.push(`${columna} = $${valores.length}`);
    };
    if (e.titulo !== undefined && e.titulo !== tarea.titulo) {
      cambios['titulo'] = [tarea.titulo, e.titulo];
      poner('titulo', e.titulo);
    }
    if (e.responsable_id !== undefined && e.responsable_id !== tarea.responsable_id) {
      const nuevo = await nombreResponsable(tx, e.responsable_id);
      cambios['responsable'] = [tarea.responsable_nombre, nuevo];
      poner('responsable_id', e.responsable_id);
    }
    if (e.fecha !== undefined && e.fecha !== tarea.fecha) {
      cambios['fecha'] = [tarea.fecha, e.fecha];
      poner('fecha', e.fecha);
    }
    if (esOt) {
      if (e.horas_estimadas !== undefined && e.horas_estimadas !== tarea.horas_estimadas) {
        cambios['horas_estimadas'] = [
          textoHoras(tarea.horas_estimadas),
          textoHoras(e.horas_estimadas),
        ];
        poner('horas_estimadas', e.horas_estimadas);
      }
      if (e.horas_reales !== undefined && e.horas_reales !== tarea.horas_reales) {
        cambios['horas_reales'] = [textoHoras(tarea.horas_reales), textoHoras(e.horas_reales)];
        poner('horas_reales', e.horas_reales);
      }
    }
    const hayEdicion = sets.length > 0;
    if (hayEdicion && cerrado) throw esOt ? otCerrada() : ticketCerrado();

    const cambiaHecha = e.hecha !== undefined && e.hecha !== tarea.hecha;
    if (cambiaHecha) {
      poner('hecha', e.hecha);
      sets.push(e.hecha ? 'hecha_en = now()' : 'hecha_en = NULL');
    }
    if (sets.length === 0) return aSalida(tarea);

    await tx.query(
      `UPDATE tarea SET ${sets.join(', ')}, actualizado_en = now() WHERE id = $1`,
      valores,
    );

    const titulo = e.titulo ?? tarea.titulo;
    if (hayEdicion) {
      await registrarEvento(tx, {
        ...duenoDe(tarea),
        actor,
        accion: 'tarea_editada',
        datos: { tarea_id: id, titulo, cambios },
      });
    }
    if (cambiaHecha) {
      await registrarEvento(tx, {
        ...duenoDe(tarea),
        actor,
        accion: e.hecha ? 'tarea_hecha' : 'tarea_reabierta',
        datos: { tarea_id: id, titulo },
      });
    }
    await registrarActividad(tx, tarea);
    if (
      e.responsable_id !== undefined &&
      e.responsable_id !== null &&
      e.responsable_id !== tarea.responsable_id &&
      e.responsable_id !== actor.id
    ) {
      pendientes.push([
        'tarea.asignada',
        {
          tarea_id: id,
          ticket_id: tarea.ticket_id,
          ot_id: tarea.ot_id,
          usuario_id: e.responsable_id,
          actor_id: actor.id,
        },
      ]);
    }
    return cargarTarea(tx, id);
  });
  publicarPendientes(pendientes);
  return salida;
}

// ---- Quitar ----

export async function quitarTarea(actor: UsuarioSesion, id: number): Promise<void> {
  await enTransaccion(async (tx) => {
    const { tarea, cerrado } = await bloquearTareaYDestino(tx, id);
    if (cerrado) throw tarea.ot_id !== null ? otCerrada() : ticketCerrado();
    // las horas de la tarea quedan en la OT sin tarea (fusionando celdas) en vez de depender del ON DELETE SET NULL
    await desvincularTareas(tx, [id]);
    await tx.query(`DELETE FROM tarea WHERE id = $1`, [id]);
    await registrarEvento(tx, {
      ...duenoDe(tarea),
      actor,
      accion: 'tarea_quitada',
      datos: { tarea_id: id, titulo: tarea.titulo },
    });
    await registrarActividad(tx, tarea);
  });
}

// ---- Mover tareas abiertas (conversión de ticket en OT y cierre con «nueva OT») ----

// Mueve las tareas no hechas de un ticket o de una OT a otra OT, después de las que esta ya tenga y
// conservando su orden relativo; las hechas se quedan. El llamador ya tiene bloqueados origen y destino.
export async function moverTareasAbiertas(
  tx: EntityManager,
  desde: { ticket_id: number } | { ot_id: number },
  hacia: { ot_id: number },
): Promise<{ id: number; titulo: string }[]> {
  const columna = 'ticket_id' in desde ? 'ticket_id' : 'ot_id';
  const origen = 'ticket_id' in desde ? desde.ticket_id : desde.ot_id;
  // TypeORM devuelve [filas, cantidad] en los UPDATE ... RETURNING
  const [filas]: [{ id: number; titulo: string; orden: number }[], number] = await tx.query(
    `WITH mover AS (
       SELECT id, row_number() OVER (ORDER BY orden, id) AS n
         FROM tarea WHERE ${columna} = $1 AND NOT hecha
     ), base AS (
       SELECT COALESCE(max(orden), 0) AS b FROM tarea WHERE ot_id = $2
     )
     UPDATE tarea t
        SET ticket_id = NULL, ot_id = $2, orden = base.b + mover.n, actualizado_en = now()
       FROM mover, base
      WHERE t.id = mover.id
      RETURNING t.id, t.titulo, t.orden`,
    [origen, hacia.ot_id],
  );
  // las horas ya registradas contra esas tareas se quedan en la OT original, sin tarea
  await desvincularTareas(
    tx,
    filas.map((f) => f.id),
  );
  return filas.sort((a, b) => a.orden - b.orden).map(({ id, titulo }) => ({ id, titulo }));
}
