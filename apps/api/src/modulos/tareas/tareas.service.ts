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
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarEvento } from '../../core/historial/evento.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { Ticket } from '../tickets/ticket.entity.js';
import { bloquearTicket, registrarActividadEnTicket } from '../tickets/tickets.service.js';

export type TareaEntradaDatos = z.infer<typeof TareaEntrada>;
export type TareaEditarEntradaDatos = z.infer<typeof TareaEditarEntrada>;
export type TareaSalidaDatos = z.infer<typeof TareaSalida>;

interface FilaTarea {
  id: number;
  ticket_id: number;
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

const SELECT_TAREA = `
  SELECT t.id, t.ticket_id, t.titulo, t.fecha::text AS fecha, t.hecha, t.hecha_en, t.orden,
         t.creado_en, t.actualizado_en,
         (t.fecha IS NOT NULL AND t.fecha < (now() AT TIME ZONE 'America/Santiago')::date AND NOT t.hecha) AS vencida,
         u.id AS responsable_id, u.nombre AS responsable_nombre, u.color_avatar AS responsable_color
    FROM tarea t LEFT JOIN usuario u ON u.id = t.responsable_id`;

function aSalida(t: FilaTarea): TareaSalidaDatos {
  return {
    id: t.id,
    ticket_id: t.ticket_id,
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

// ---- Crear ----

export async function crearTarea(
  actor: UsuarioSesion,
  ticket_id: number,
  e: TareaEntradaDatos,
): Promise<TareaSalidaDatos> {
  return enTransaccion(async (tx) => {
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
    return cargarTarea(tx, id);
  });
}

// ---- Editar / marcar ----

// Toma el ticket antes que la tarea (mismo orden de bloqueo que el resto de la API).
async function bloquearTareaYTicket(
  tx: EntityManager,
  id: number,
): Promise<{ tarea: FilaTarea; cerrado: boolean }> {
  const [previa]: { ticket_id: number }[] = await tx.query(
    `SELECT ticket_id FROM tarea WHERE id = $1`,
    [id],
  );
  if (!previa) throw new ErrorApp('NO_ENCONTRADO', 'Tarea no encontrada');
  const t = await bloquearTicket(tx, previa.ticket_id);
  const [tarea]: FilaTarea[] = await tx.query(`${SELECT_TAREA} WHERE t.id = $1 FOR UPDATE OF t`, [
    id,
  ]);
  if (!tarea) throw new ErrorApp('NO_ENCONTRADO', 'Tarea no encontrada');
  return { tarea, cerrado: t.cerrado_en !== null };
}

export async function editarTarea(
  actor: UsuarioSesion,
  id: number,
  e: TareaEditarEntradaDatos,
): Promise<TareaSalidaDatos> {
  return enTransaccion(async (tx) => {
    const { tarea, cerrado } = await bloquearTareaYTicket(tx, id);

    // Cambios reales de título, responsable y fecha; marcar/desmarcar se permite con el ticket cerrado
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
    const hayEdicion = sets.length > 0;
    if (hayEdicion && cerrado) throw ticketCerrado();

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
        entidad: 'ticket',
        entidad_id: tarea.ticket_id,
        actor,
        accion: 'tarea_editada',
        datos: { tarea_id: id, titulo, cambios },
      });
    }
    if (cambiaHecha) {
      await registrarEvento(tx, {
        entidad: 'ticket',
        entidad_id: tarea.ticket_id,
        actor,
        accion: e.hecha ? 'tarea_hecha' : 'tarea_reabierta',
        datos: { tarea_id: id, titulo },
      });
    }
    await registrarActividadEnTicket(tx, tarea.ticket_id);
    return cargarTarea(tx, id);
  });
}

// ---- Quitar ----

export async function quitarTarea(actor: UsuarioSesion, id: number): Promise<void> {
  await enTransaccion(async (tx) => {
    const { tarea, cerrado } = await bloquearTareaYTicket(tx, id);
    if (cerrado) throw ticketCerrado();
    await tx.query(`DELETE FROM tarea WHERE id = $1`, [id]);
    await registrarEvento(tx, {
      entidad: 'ticket',
      entidad_id: tarea.ticket_id,
      actor,
      accion: 'tarea_quitada',
      datos: { tarea_id: id, titulo: tarea.titulo },
    });
    await registrarActividadEnTicket(tx, tarea.ticket_id);
  });
}
