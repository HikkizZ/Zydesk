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
import { registrarEvento } from '../../core/historial/evento.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { asociarArchivos, archivosDeMensajes } from '../archivos/archivos.service.js';
import { registrarHorasDesdeMensaje } from '../horas/horas.service.js';
import { bloquearOt, existeOt, registrarActividadEnOt } from '../ots/ots.acceso.js';
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

async function asegurarOt(m: EntityManager, id: number): Promise<void> {
  if (!(await existeOt(m, id))) throw new ErrorApp('NO_ENCONTRADO', 'OT no encontrada');
}

const yaCopiado = (): ErrorApp =>
  new ErrorApp('MENSAJE_YA_COPIADO', 'El mensaje ya se copió al ticket');

// Autores, menciones, archivos y datos de copia de varios mensajes con una consulta cada uno.
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
  // Una copia en el ticket comparte los archivos del mensaje de OT de origen (sin menciones ni filas nuevas)
  const copias = filas.filter((f) => f.copiado_desde_id !== null);
  const archivos = await archivosDeMensajes(m, [...ids, ...copias.map((f) => f.copiado_desde_id!)]);
  const origenes: { id: number; mensaje_id: number; ot_id: number; ot_codigo: string }[] =
    copias.length > 0
      ? await m.query(
          `SELECT c.id, c.copiado_desde_id AS mensaje_id, o.id AS ot_id, o.codigo AS ot_codigo
             FROM mensaje c JOIN mensaje src ON src.id = c.copiado_desde_id JOIN ot o ON o.id = src.ot_id
            WHERE c.id = ANY($1::int[])`,
          [copias.map((f) => f.id)],
        )
      : [];
  const conCopia: { copiado_desde_id: number }[] = await m.query(
    `SELECT copiado_desde_id FROM mensaje WHERE copiado_desde_id = ANY($1::int[])`,
    [ids],
  );
  const copiados = new Set(conCopia.map((c) => c.copiado_desde_id));
  const origenDe = new Map(origenes.map((o) => [o.id, o]));
  const porAutor = new Map(autores.map((a) => [a.id, a]));
  return filas.map((f) => {
    const autor = f.autor_id === null ? undefined : porAutor.get(f.autor_id);
    const origen = origenDe.get(f.id);
    return {
      id: f.id,
      ticket_id: f.ticket_id,
      ot_id: f.ot_id,
      tipo: f.tipo,
      autor: autor ? usuarioBreve(autor) : null,
      texto: f.texto,
      horas: f.horas,
      archivos: archivos.get(f.copiado_desde_id ?? f.id) ?? [],
      mencionados:
        f.copiado_desde_id !== null
          ? []
          : menciones.filter((x) => x.mensaje_id === f.id).map(usuarioBreve),
      creado_en: f.creado_en.toISOString(),
      copiado_de: origen
        ? { mensaje_id: origen.mensaje_id, ot: { id: origen.ot_id, codigo: origen.ot_codigo } }
        : null,
      copiado_al_ticket: copiados.has(f.id),
    };
  });
}

// ---- Crear (spec §6.1) ----

// Valida las menciones, inserta el mensaje y asocia archivos, menciones y horas (destino ya bloqueado).
async function insertarMensaje(
  tx: EntityManager,
  actor: UsuarioSesion,
  destino: { ticket_id: number } | { ot_id: number },
  e: MensajeEntradaDatos,
): Promise<Mensaje> {
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
    ticket_id: 'ticket_id' in destino ? destino.ticket_id : null,
    ot_id: 'ot_id' in destino ? destino.ot_id : null,
    copiado_desde_id: null,
    tipo: e.tipo,
    autor_id: actor.id,
    texto: e.texto,
    horas: e.horas,
  });
  await asociarArchivos(
    tx,
    e.archivo_ids,
    'ot_id' in destino
      ? { entidad: 'ot', entidad_id: destino.ot_id, mensaje_id: mensaje.id }
      : { entidad: 'ticket', entidad_id: destino.ticket_id, mensaje_id: mensaje.id },
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
      mensaje_id: mensaje.id,
      horas: e.horas,
      ...destino,
    });
  }
  return mensaje;
}

export async function crearMensaje(
  actor: UsuarioSesion,
  ticket_id: number,
  e: MensajeEntradaDatos,
): Promise<MensajeSalidaDatos> {
  if (e.copiar_al_ticket) {
    throw new ErrorApp('VALIDACION', 'Datos inválidos', {
      copiar_al_ticket: ['Solo en mensajes de OT'],
    });
  }
  return enTransaccion(async (tx) => {
    // Permitido también en tickets cerrados y archivados
    await bloquearTicket(tx, ticket_id);
    const mensaje = await insertarMensaje(tx, actor, { ticket_id }, e);
    await registrarActividadEnTicket(tx, ticket_id, { respuesta: e.tipo === 'seguimiento' });

    const fila = await tx.findOneByOrFail(Mensaje, { id: mensaje.id });
    return (await aSalidas(tx, [fila]))[0]!;
  });
}

// Permitido también con la OT cerrada o cancelada. Con `copiar_al_ticket` se bloquea ticket → OT (§1.2).
export async function crearMensajeDeOt(
  actor: UsuarioSesion,
  ot_id: number,
  e: MensajeEntradaDatos,
): Promise<MensajeSalidaDatos> {
  return enTransaccion(async (tx) => {
    if (e.copiar_al_ticket) {
      const [previa]: { ticket_id: number }[] = await tx.query(
        `SELECT ticket_id FROM ot WHERE id = $1`,
        [ot_id],
      );
      if (!previa) throw new ErrorApp('NO_ENCONTRADO', 'OT no encontrada');
      await bloquearTicket(tx, previa.ticket_id);
    }
    await bloquearOt(tx, ot_id);
    const mensaje = await insertarMensaje(tx, actor, { ot_id }, e);
    await registrarActividadEnOt(tx, ot_id);
    if (e.copiar_al_ticket) await copiarAlTicket(tx, actor, mensaje);

    const fila = await tx.findOneByOrFail(Mensaje, { id: mensaje.id });
    return (await aSalidas(tx, [fila]))[0]!;
  });
}

// ---- Copiar al ticket (spec §6.2) ----

// Ticket y OT del mensaje ya bloqueados por el llamador. No duplica archivos, menciones ni horas.
async function copiarAlTicket(
  tx: EntityManager,
  actor: UsuarioSesion,
  mensaje: Mensaje,
): Promise<Mensaje> {
  const [ot]: { ticket_id: number; codigo: string }[] = await tx.query(
    `SELECT ticket_id, codigo FROM ot WHERE id = $1`,
    [mensaje.ot_id],
  );
  const existe: unknown[] = await tx.query(`SELECT 1 FROM mensaje WHERE copiado_desde_id = $1`, [
    mensaje.id,
  ]);
  if (existe.length > 0) throw yaCopiado();

  let copia: Mensaje;
  try {
    copia = await tx.save(Mensaje, {
      ticket_id: ot!.ticket_id,
      ot_id: null,
      copiado_desde_id: mensaje.id,
      tipo: mensaje.tipo,
      autor_id: mensaje.autor_id,
      texto: mensaje.texto,
      horas: null,
    });
  } catch (err) {
    if ((err as { driverError?: { code?: string } }).driverError?.code === '23505') {
      throw yaCopiado();
    }
    throw err;
  }
  await registrarEvento(tx, {
    entidad: 'ticket',
    entidad_id: ot!.ticket_id,
    actor,
    accion: 'seguimiento_copiado',
    datos: {
      mensaje_id: copia.id,
      desde_mensaje_id: mensaje.id,
      ot_id: mensaje.ot_id,
      codigo: ot!.codigo,
    },
  });
  await registrarActividadEnTicket(tx, ot!.ticket_id, {
    respuesta: mensaje.tipo === 'seguimiento',
  });
  return copia;
}

export async function copiarMensajeAlTicket(
  actor: UsuarioSesion,
  mensaje_id: number,
): Promise<MensajeSalidaDatos> {
  return enTransaccion(async (tx) => {
    const [previo]: { ot_id: number | null; ticket_id: number | null }[] = await tx.query(
      `SELECT m.ot_id, o.ticket_id FROM mensaje m LEFT JOIN ot o ON o.id = m.ot_id WHERE m.id = $1`,
      [mensaje_id],
    );
    if (!previo || previo.ot_id === null) {
      throw new ErrorApp('NO_ENCONTRADO', 'Mensaje de OT no encontrado');
    }
    await bloquearTicket(tx, previo.ticket_id!);
    await bloquearOt(tx, previo.ot_id);
    const mensaje = await tx.findOneByOrFail(Mensaje, { id: mensaje_id });
    const copia = await copiarAlTicket(tx, actor, mensaje);
    await registrarActividadEnOt(tx, previo.ot_id);
    return (await aSalidas(tx, [copia]))[0]!;
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

export async function listarMensajesDeOt(
  ot_id: number,
  tipo?: TipoMensaje,
): Promise<MensajeSalidaDatos[]> {
  const m = dataSource.manager;
  await asegurarOt(m, ot_id);
  const filas = await m.find(Mensaje, {
    where: tipo ? { ot_id, tipo } : { ot_id },
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
  await asegurarTicket(dataSource.manager, ticket_id);
  return actividadDe({ ticket_id }, q);
}

export async function actividadDeOt(
  ot_id: number,
  q: ActividadQueryDatos,
): Promise<ActividadSalidaDatos> {
  await asegurarOt(dataSource.manager, ot_id);
  return actividadDe({ ot_id }, q);
}

// Mensajes y eventos de un ticket o de una OT, con los conteos por pestaña.
async function actividadDe(
  destino: { ticket_id: number } | { ot_id: number },
  q: ActividadQueryDatos,
): Promise<ActividadSalidaDatos> {
  const m = dataSource.manager;
  const esOt = 'ot_id' in destino;
  const columna = esOt ? 'ot_id' : 'ticket_id';
  const entidad = esOt ? 'ot' : 'ticket';
  const dueno = esOt ? destino.ot_id : destino.ticket_id;

  const [c]: { seguimiento: number; nota_interna: number; historial: number }[] = await m.query(
    `SELECT (SELECT count(*) FROM mensaje WHERE ${columna} = $1 AND tipo = 'seguimiento')::int AS seguimiento,
            (SELECT count(*) FROM mensaje WHERE ${columna} = $1 AND tipo = 'nota_interna')::int AS nota_interna,
            (SELECT count(*) FROM evento WHERE entidad = '${entidad}' AND entidad_id = $2)::int AS historial`,
    [dueno, String(dueno)],
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
        where: q.tipo === 'todo' ? destino : { ...destino, tipo: q.tipo as TipoMensaje },
        order: { creado_en: 'ASC', id: 'ASC' },
      })
    : [];
  const eventos: FilaEvento[] = conEventos
    ? await m.query(
        `SELECT e.id, e.creado_en, e.autor_id, u.nombre AS autor_nombre, e.accion, e.campo,
                e.valor_anterior, e.valor_nuevo, e.datos
           FROM evento e LEFT JOIN usuario u ON u.id = e.autor_id
          WHERE e.entidad = '${entidad}' AND e.entidad_id = $1
          ORDER BY e.creado_en, e.id`,
        [String(dueno)],
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
