import {
  iniciales,
  type ActividadQuery,
  type ActividadSalida,
  type EventoTicketSalida,
  type MensajeEntrada,
  type MensajeSalida,
  type TipoMensaje,
} from '@zydesk/shared';
import type { z } from 'zod';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { asociarArchivos, archivosDeMensajes } from '../archivos/archivos.service.js';
import { registrarHorasDesdeMensaje } from '../horas/horas.service.js';
import { Ticket } from '../tickets/ticket.entity.js';
import { bloquearTicket, registrarActividadEnTicket } from '../tickets/tickets.service.js';
import { Mensaje } from './mensaje.entity.js';

export type MensajeEntradaDatos = z.infer<typeof MensajeEntrada>;
export type MensajeSalidaDatos = z.infer<typeof MensajeSalida>;
export type ActividadQueryDatos = z.infer<typeof ActividadQuery>;
export type ActividadSalidaDatos = z.infer<typeof ActividadSalida>;
type EventoSalidaDatos = z.infer<typeof EventoTicketSalida>;

interface UsuarioFila {
  id: number;
  nombre: string;
  color_avatar: string;
}

const usuarioBreve = (u: UsuarioFila): MensajeSalidaDatos['mencionados'][number] => ({
  id: u.id,
  nombre: u.nombre,
  iniciales: iniciales(u.nombre),
  color_avatar: u.color_avatar,
});

async function asegurarTicket(m: EntityManager, id: number): Promise<void> {
  if (!(await m.existsBy(Ticket, { id }))) {
    throw new ErrorApp('NO_ENCONTRADO', 'Ticket no encontrado');
  }
}

// Autores, menciones y archivos de varios mensajes con una consulta cada uno.
async function aSalidas(m: EntityManager, filas: Mensaje[]): Promise<MensajeSalidaDatos[]> {
  if (filas.length === 0) return [];
  const ids = filas.map((f) => f.id);
  const autorIds = [
    ...new Set(filas.map((f) => f.autor_id).filter((v): v is number => v !== null)),
  ];
  const autores: UsuarioFila[] =
    autorIds.length > 0
      ? await m.query(`SELECT id, nombre, color_avatar FROM usuario WHERE id = ANY($1::int[])`, [
          autorIds,
        ])
      : [];
  const menciones: (UsuarioFila & { mensaje_id: number })[] = await m.query(
    `SELECT mn.mensaje_id, u.id, u.nombre, u.color_avatar
       FROM mencion mn JOIN usuario u ON u.id = mn.usuario_id
      WHERE mn.mensaje_id = ANY($1::int[]) ORDER BY u.nombre, u.id`,
    [ids],
  );
  const archivos = await archivosDeMensajes(m, ids);
  const porAutor = new Map(autores.map((a) => [a.id, a]));
  return filas.map((f) => {
    const autor = f.autor_id === null ? undefined : porAutor.get(f.autor_id);
    return {
      id: f.id,
      ticket_id: f.ticket_id,
      ot_id: null, // Fase 3: los mensajes de OT los sirve el bloque 3C
      tipo: f.tipo,
      autor: autor ? usuarioBreve(autor) : null,
      texto: f.texto,
      horas: f.horas,
      archivos: archivos.get(f.id) ?? [],
      mencionados: menciones.filter((x) => x.mensaje_id === f.id).map(usuarioBreve),
      creado_en: f.creado_en.toISOString(),
      copiado_de: null,
      copiado_al_ticket: false,
    };
  });
}

// ---- Crear (spec §6.1) ----

export async function crearMensaje(
  actor: UsuarioSesion,
  ticket_id: number,
  e: MensajeEntradaDatos,
): Promise<MensajeSalidaDatos> {
  return enTransaccion(async (tx) => {
    // Permitido también en tickets cerrados y archivados
    await bloquearTicket(tx, ticket_id);

    const mencionados = [...new Set(e.mencionados_ids)];
    if (mencionados.length > 0) {
      const validos: { id: number }[] = await tx.query(
        `SELECT id FROM usuario WHERE id = ANY($1::int[]) AND activo`,
        [mencionados],
      );
      if (validos.length !== mencionados.length) {
        throw new ErrorApp('VALIDACION', 'Datos inválidos', {
          mencionados_ids: ['Hay usuarios que no existen o están inactivos'],
        });
      }
    }

    const mensaje = await tx.save(Mensaje, {
      ticket_id,
      tipo: e.tipo,
      autor_id: actor.id,
      texto: e.texto,
      horas: e.horas,
    });
    await asociarArchivos(
      tx,
      e.archivo_ids,
      { entidad: 'ticket', entidad_id: ticket_id, mensaje_id: mensaje.id },
      actor,
    );
    for (const usuario_id of mencionados) {
      // Sin avisos: los publica la Fase 6
      await tx.query(`INSERT INTO mencion (mensaje_id, usuario_id) VALUES ($1, $2)`, [
        mensaje.id,
        usuario_id,
      ]);
    }
    if (e.horas !== null) {
      await registrarHorasDesdeMensaje(tx, {
        usuario_id: actor.id,
        ticket_id,
        mensaje_id: mensaje.id,
        horas: e.horas,
      });
    }
    await registrarActividadEnTicket(tx, ticket_id, { respuesta: e.tipo === 'seguimiento' });

    const fila = await tx.findOneByOrFail(Mensaje, { id: mensaje.id });
    return (await aSalidas(tx, [fila]))[0]!;
  });
}

// ---- Listar ----

export async function listarMensajes(
  ticket_id: number,
  tipo?: TipoMensaje,
): Promise<MensajeSalidaDatos[]> {
  const m = dataSource.manager;
  await asegurarTicket(m, ticket_id);
  const filas = await m.find(Mensaje, {
    where: tipo ? { ticket_id, tipo } : { ticket_id },
    order: { creado_en: 'ASC', id: 'ASC' },
  });
  return aSalidas(m, filas);
}

// ---- Actividad (spec §6.3) ----

interface FilaEvento {
  id: string | number;
  creado_en: Date;
  autor_id: number | null;
  autor_nombre: string | null;
  accion: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  datos: Record<string, unknown> | null;
}

type Item = ActividadSalidaDatos['items'][number];

export async function actividadDeTicket(
  ticket_id: number,
  q: ActividadQueryDatos,
): Promise<ActividadSalidaDatos> {
  const m = dataSource.manager;
  await asegurarTicket(m, ticket_id);

  const [c]: { seguimiento: number; nota_interna: number; historial: number }[] = await m.query(
    `SELECT (SELECT count(*) FROM mensaje WHERE ticket_id = $1 AND tipo = 'seguimiento')::int AS seguimiento,
            (SELECT count(*) FROM mensaje WHERE ticket_id = $1 AND tipo = 'nota_interna')::int AS nota_interna,
            (SELECT count(*) FROM evento WHERE entidad = 'ticket' AND entidad_id = $2)::int AS historial`,
    [ticket_id, String(ticket_id)],
  );
  const conteos = {
    todo: c!.seguimiento + c!.nota_interna + c!.historial,
    seguimiento: c!.seguimiento,
    nota_interna: c!.nota_interna,
    historial: c!.historial,
  };

  const conMensajes = q.tipo !== 'historial';
  const conEventos = q.tipo === 'todo' || q.tipo === 'historial';

  const mensajes = conMensajes
    ? await m.find(Mensaje, {
        where: q.tipo === 'todo' ? { ticket_id } : { ticket_id, tipo: q.tipo as TipoMensaje },
        order: { creado_en: 'ASC', id: 'ASC' },
      })
    : [];
  const eventos: FilaEvento[] = conEventos
    ? await m.query(
        `SELECT e.id, e.creado_en, e.autor_id, u.nombre AS autor_nombre, e.accion, e.campo,
                e.valor_anterior, e.valor_nuevo, e.datos
           FROM evento e LEFT JOIN usuario u ON u.id = e.autor_id
          WHERE e.entidad = 'ticket' AND e.entidad_id = $1
          ORDER BY e.creado_en, e.id`,
        [String(ticket_id)],
      )
    : [];

  const salidas = await aSalidas(m, mensajes);
  const items: { item: Item; t: number; orden: number; id: number }[] = [
    ...eventos.map((e) => {
      const evento: EventoSalidaDatos = {
        id: Number(e.id),
        creado_en: e.creado_en.toISOString(),
        autor: e.autor_id === null ? null : { id: e.autor_id, nombre: e.autor_nombre ?? '' },
        accion: e.accion,
        campo: e.campo,
        valor_anterior: e.valor_anterior,
        valor_nuevo: e.valor_nuevo,
        datos: e.datos,
      };
      const item: Item = { tipo: 'evento', creado_en: evento.creado_en, evento };
      // A igual instante, los eventos van antes que los mensajes
      return { item, t: e.creado_en.getTime(), orden: 0, id: evento.id };
    }),
    ...salidas.map((mensaje) => {
      const item: Item = { tipo: 'mensaje', creado_en: mensaje.creado_en, mensaje };
      return { item, t: Date.parse(mensaje.creado_en), orden: 1, id: mensaje.id };
    }),
  ];
  items.sort((a, b) => a.t - b.t || a.orden - b.orden || a.id - b.id);
  return { items: items.map((x) => x.item), conteos };
}
