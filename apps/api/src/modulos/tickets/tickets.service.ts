import {
  ETIQUETA_ESTADO_TICKET,
  ETIQUETA_PRIORIDAD,
  esCerrado,
  puedeTransicionar,
  sumarPlazo,
  transicionesDesde,
  ZONA,
  type CambioEstadoTicketDatos,
  type EstadoTicket,
  type Plazo,
  type Prioridad,
} from '@zydesk/shared';
import { IsNull, type EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarCambios, registrarEvento } from '../../core/historial/evento.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { fuenteNumeros } from '../../core/numeracion/fuente.js';
import { siguienteNumero } from '../../core/numeracion/numeracion.js';
import { leerCorreo, type CorreoLeido } from '../../integraciones/correo/index.js';
import { Archivo } from '../archivos/archivo.entity.js';
import {
  asociarArchivos,
  eliminarDeDisco,
  guardarBufferComoArchivo,
} from '../archivos/archivos.service.js';
import { cargarCalendario } from '../departamentos/departamentos.service.js';
import { cargarTicket, listarTablero, listarTickets } from './tickets.consulta.js';
import type {
  ResponsablesEntradaDatos,
  SeguidoresEntradaDatos,
  TableroQueryDatos,
  TicketCrearEntradaDatos,
  TicketEditarEntradaDatos,
  TicketResumenDatos,
  TicketSalidaDatos,
  TicketsQueryDatos,
} from './tickets.tipos.js';

export { cargarTicket };

export function obtenerTicket(id: number): Promise<TicketSalidaDatos> {
  return cargarTicket(dataSource.manager, id);
}

export function listar(
  actor: UsuarioSesion,
  q: TicketsQueryDatos,
): ReturnType<typeof listarTickets> {
  return listarTickets(dataSource.manager, actor.id, q);
}

export function tablero(actor: UsuarioSesion, q: TableroQueryDatos): Promise<TicketResumenDatos[]> {
  return listarTablero(dataSource.manager, actor.id, q);
}

// ---- Utilidades ----

const formatoFechaHora = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const anioEnSantiago = (d: Date): number =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric' }).format(d));

const ETIQUETA_ORIGEN: Record<string, string> = { externo: 'Externo', interno: 'Interno' };

const formatearHoras = (h: number): string => `${String(h).replace('.', ',')} h`;
const recortar = (s: string): string => (s.length > 120 ? `${s.slice(0, 120)}…` : s);

function errorValidacion(errores: Record<string, string[]>): ErrorApp {
  return new ErrorApp('VALIDACION', 'Datos inválidos', errores);
}

const ticketCerrado = (): ErrorApp =>
  new ErrorApp('TICKET_CERRADO', 'Reabre el ticket para editarlo');

interface FilaBloqueada {
  id: number;
  codigo: string;
  estado: EstadoTicket;
  cerrado_en: Date | null;
  primera_respuesta_en: Date | null;
}

async function bloquearTicket(tx: EntityManager, id: number): Promise<FilaBloqueada> {
  const [t]: FilaBloqueada[] = await tx.query(
    `SELECT id, codigo, estado, cerrado_en, primera_respuesta_en FROM ticket WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!t) throw new ErrorApp('NO_ENCONTRADO', 'Ticket no encontrado');
  return t;
}

// Ids de usuarios inexistentes o inactivos.
async function usuariosNoValidos(tx: EntityManager, ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const validos: { id: number }[] = await tx.query(
    `SELECT id FROM usuario WHERE id = ANY($1::int[]) AND activo`,
    [ids],
  );
  const set = new Set(validos.map((v) => v.id));
  return ids.filter((i) => !set.has(i));
}

async function nombresUsuarios(tx: EntityManager, ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const filas: { id: number; nombre: string }[] = await tx.query(
    `SELECT id, nombre FROM usuario WHERE id = ANY($1::int[])`,
    [ids],
  );
  return new Map(filas.map((f) => [f.id, f.nombre]));
}

interface CategoriaPlazos {
  id: number;
  responsable_defecto_id: number | null;
  plazo_respuesta: Plazo;
  plazo_resolucion: Record<Prioridad, Plazo>;
}

async function departamentoDe(
  tx: EntityManager,
  usuario_id: number | null,
): Promise<number | null> {
  if (usuario_id === null) return null;
  const [u]: { departamento_id: number | null }[] = await tx.query(
    `SELECT departamento_id FROM usuario WHERE id = $1`,
    [usuario_id],
  );
  return u?.departamento_id ?? null;
}

// ---- Fase 3 ----

// Fase 3: consulta ot WHERE ticket_id = $1 AND etapa NOT IN ('cerrada','cancelada') (ADR 0004)
export async function otsAbiertas(
  _tx: EntityManager,
  _ticket_id: number,
): Promise<Array<{ id: number; codigo: string; etapa: string }>> {
  return [];
}

// ---- Crear (spec §5.3) ----

export async function crearTicket(
  actor: UsuarioSesion,
  e: TicketCrearEntradaDatos,
): Promise<TicketSalidaDatos> {
  // Claves escritas en disco durante la creación (texto pegado, adjuntos extraídos): si la transacción
  // se revierte, hay que borrarlas.
  const claves: string[] = [];
  try {
    return await enTransaccion((tx) => crearTicketEnTx(tx, actor, e, claves));
  } catch (err) {
    await eliminarDeDisco(claves);
    throw err;
  }
}

async function crearTicketEnTx(
  tx: EntityManager,
  actor: UsuarioSesion,
  e: TicketCrearEntradaDatos,
  claves: string[],
): Promise<TicketSalidaDatos> {
  // 1. Referencias
  const errores: Record<string, string[]> = {};
  if (e.cliente_id !== null) {
    const f: unknown[] = await tx.query(`SELECT 1 FROM cliente WHERE id = $1 AND activo`, [
      e.cliente_id,
    ]);
    if (f.length === 0) errores['cliente_id'] = ['No existe o está inactivo'];
  }
  let categoria: CategoriaPlazos | null = null;
  if (e.categoria_id !== null) {
    const [c]: CategoriaPlazos[] = await tx.query(
      `SELECT id, responsable_defecto_id, plazo_respuesta, plazo_resolucion
         FROM categoria WHERE id = $1 AND activo`,
      [e.categoria_id],
    );
    if (c) categoria = c;
    else errores['categoria_id'] = ['No existe o está inactiva'];
  }
  const principal = e.responsable_principal_id;
  if (principal !== null && (await usuariosNoValidos(tx, [principal])).length > 0) {
    errores['responsable_principal_id'] = ['No existe o está inactivo'];
  }
  if ((await usuariosNoValidos(tx, e.responsables_ids)).length > 0) {
    errores['responsables_ids'] = ['Hay usuarios que no existen o están inactivos'];
  }
  if ((await usuariosNoValidos(tx, e.seguidores_ids)).length > 0) {
    errores['seguidores_ids'] = ['Hay usuarios que no existen o están inactivos'];
  }
  if (Object.keys(errores).length > 0) throw errorValidacion(errores);

  // 2. Número y código
  const { numero, codigo } = await siguienteNumero(tx, 'ticket', fuenteNumeros);

  // 3. Correo (se lee antes de insertar; se guarda cuando existe el ticket)
  let correo: CorreoLeido | null = null;
  let archivoCorreo: Archivo | null = null;
  let indices: number[] = [];
  if (e.correo !== null && 'archivo_id' in e.correo) {
    archivoCorreo = await tx.findOne(Archivo, {
      where: {
        id: e.correo.archivo_id,
        entidad: IsNull(),
        subido_por: actor.id,
        categoria: 'correo',
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!archivoCorreo) throw errorValidacion({ correo: ['Archivo de correo no disponible'] });
    correo = await leerCorreo({ archivo: archivoCorreo });
    indices = [...new Set(e.correo.adjuntos_indices)];
  } else if (e.correo !== null) {
    correo = await leerCorreo({ texto: e.correo.texto });
  }
  if (correo) {
    const disponibles = correo.adjuntos;
    if (indices.some((i) => !disponibles.some((a) => a.indice === i))) {
      throw errorValidacion({ correo: ['Adjunto del correo inexistente'] });
    }
  }

  // 4. Plazos (ADR 0005): calendario del principal → responsable por defecto de la categoría → actor
  const desde = e.inicio_planificado ? new Date(e.inicio_planificado) : new Date();
  let fecha_limite: string | null = e.fecha_limite;
  let respuesta_limite: string | null = null;
  if (categoria) {
    const departamento_id =
      (await departamentoDe(tx, principal)) ??
      (await departamentoDe(tx, categoria.responsable_defecto_id)) ??
      (await departamentoDe(tx, actor.id));
    if (departamento_id !== null) {
      const anio = anioEnSantiago(desde);
      const calendario = await cargarCalendario(tx, departamento_id, [anio, anio + 1]);
      if (fecha_limite === null) {
        fecha_limite = sumarPlazo(
          desde,
          categoria.plazo_resolucion[e.prioridad],
          calendario,
        ).toISOString();
      }
      respuesta_limite = sumarPlazo(desde, categoria.plazo_respuesta, calendario).toISOString();
    }
  }

  // 5. Ticket, responsables, seguidores y archivos
  const [fila]: { id: number }[] = await tx.query(
    `INSERT INTO ticket (numero, codigo, asunto, descripcion, cliente_id, solicitante_nombre, solicitante_correo,
                         origen, prioridad, categoria_id, estado, inicio_planificado, fecha_limite,
                         respuesta_limite, horas_estimadas, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'nuevo', $11, $12, $13, $14, $15)
     RETURNING id`,
    [
      numero,
      codigo,
      e.asunto,
      e.descripcion,
      e.cliente_id,
      e.solicitante_nombre,
      e.solicitante_correo,
      e.origen,
      e.prioridad,
      e.categoria_id,
      e.inicio_planificado,
      fecha_limite,
      respuesta_limite,
      e.horas_estimadas,
      actor.id,
    ],
  );
  const id = fila!.id;
  if (principal !== null) {
    await tx.query(
      `INSERT INTO ticket_responsable (ticket_id, usuario_id, principal) VALUES ($1, $2, true)`,
      [id, principal],
    );
  }
  for (const usuario_id of e.responsables_ids) {
    await tx.query(
      `INSERT INTO ticket_responsable (ticket_id, usuario_id, principal) VALUES ($1, $2, false)`,
      [id, usuario_id],
    );
  }
  for (const usuario_id of e.seguidores_ids) {
    await tx.query(`INSERT INTO ticket_seguidor (ticket_id, usuario_id) VALUES ($1, $2)`, [
      id,
      usuario_id,
    ]);
  }
  const destino = { entidad: 'ticket', entidad_id: id } as const;
  await asociarArchivos(tx, e.archivo_ids, destino, actor);

  let adjuntos_extraidos = 0;
  if (correo) {
    let archivo_id: number;
    if (archivoCorreo) {
      await asociarArchivos(tx, [archivoCorreo.id], destino, actor);
      archivo_id = archivoCorreo.id;
    } else {
      // Texto pegado: se guarda tal cual como `.txt` descargable (spec §5.3 paso 3)
      const texto = e.correo !== null && 'texto' in e.correo ? e.correo.texto : '';
      const original = await guardarBufferComoArchivo(tx, {
        contenido: Buffer.from(texto, 'utf8'),
        nombre_original: 'correo-pegado.txt',
        subido_por: actor.id,
        destino,
        tipo: { tipo_mime: 'text/plain', ext: '.txt' },
        categoria: 'correo',
      });
      claves.push(original.clave);
      archivo_id = original.id;
    }
    const [ca]: { id: number }[] = await tx.query(
      `INSERT INTO correo_adjunto (ticket_id, archivo_id, origen, de, para, fecha, asunto, cuerpo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        id,
        archivo_id,
        correo.origen,
        correo.de,
        correo.para,
        correo.fecha,
        correo.asunto,
        correo.cuerpo_texto,
      ],
    );
    for (const indice of indices) {
      const adjunto = correo.adjuntos.find((a) => a.indice === indice)!;
      const guardado = await guardarBufferComoArchivo(tx, {
        contenido: await adjunto.contenido(),
        nombre_original: adjunto.nombre,
        subido_por: actor.id,
        destino,
        origen_correo_id: ca!.id,
      });
      claves.push(guardado.clave);
      adjuntos_extraidos++;
    }
  }

  // 6. Evento
  await registrarEvento(tx, {
    entidad: 'ticket',
    entidad_id: id,
    actor,
    accion: 'creado',
    datos: { desde_correo: correo !== null, adjuntos_extraidos, codigo },
  });

  // 7.
  return cargarTicket(tx, id);
}

// ---- Editar (spec §5.1 y §5.5) ----

interface ValoresRastreados {
  asunto: string;
  descripcion: string | null;
  cliente: string | null;
  solicitante: string | null;
  origen: string;
  prioridad: Prioridad;
  categoria: string | null;
  inicio_planificado: Date | null;
  fecha_limite: Date | null;
  horas_estimadas: number | null;
}

async function valoresRastreados(tx: EntityManager, id: number): Promise<ValoresRastreados> {
  const [f]: (Omit<ValoresRastreados, 'solicitante' | 'cliente' | 'categoria'> & {
    cliente_nombre: string | null;
    categoria_nombre: string | null;
    solicitante_nombre: string | null;
    solicitante_correo: string | null;
  })[] = await tx.query(
    `SELECT t.asunto, t.descripcion, t.origen, t.prioridad, t.inicio_planificado, t.fecha_limite,
            t.horas_estimadas::float8 AS horas_estimadas, c.nombre AS cliente_nombre,
            cat.nombre AS categoria_nombre, t.solicitante_nombre, t.solicitante_correo::text AS solicitante_correo
       FROM ticket t LEFT JOIN cliente c ON c.id = t.cliente_id LEFT JOIN categoria cat ON cat.id = t.categoria_id
      WHERE t.id = $1`,
    [id],
  );
  const s = f!;
  const solicitante =
    s.solicitante_nombre && s.solicitante_correo
      ? `${s.solicitante_nombre} <${s.solicitante_correo}>`
      : (s.solicitante_nombre ?? s.solicitante_correo);
  return {
    asunto: s.asunto,
    descripcion: s.descripcion,
    cliente: s.cliente_nombre,
    solicitante,
    origen: s.origen,
    prioridad: s.prioridad,
    categoria: s.categoria_nombre,
    inicio_planificado: s.inicio_planificado,
    fecha_limite: s.fecha_limite,
    horas_estimadas: s.horas_estimadas,
  };
}

const CAMPOS_RASTREADOS = [
  'asunto',
  'descripcion',
  'cliente',
  'solicitante',
  'origen',
  'prioridad',
  'categoria',
  'inicio_planificado',
  'fecha_limite',
  'horas_estimadas',
] as const;

const ETIQUETAS_CAMBIO: Record<string, (v: unknown) => string> = {
  descripcion: (v) => recortar(String(v)),
  origen: (v) => ETIQUETA_ORIGEN[String(v)] ?? String(v),
  prioridad: (v) => ETIQUETA_PRIORIDAD[v as Prioridad],
  inicio_planificado: (v) => formatoFechaHora.format(v as Date),
  fecha_limite: (v) => formatoFechaHora.format(v as Date),
  horas_estimadas: (v) => formatearHoras(v as number),
};

const COLUMNAS_EDITABLES = [
  'asunto',
  'descripcion',
  'cliente_id',
  'solicitante_nombre',
  'solicitante_correo',
  'origen',
  'prioridad',
  'categoria_id',
  'inicio_planificado',
  'fecha_limite',
  'horas_estimadas',
] as const;

export async function editarTicket(
  actor: UsuarioSesion,
  id: number,
  e: TicketEditarEntradaDatos,
): Promise<TicketSalidaDatos> {
  return enTransaccion(async (tx) => {
    const t = await bloquearTicket(tx, id);
    if (t.cerrado_en !== null) throw ticketCerrado();

    const errores: Record<string, string[]> = {};
    if (e.cliente_id) {
      const f: unknown[] = await tx.query(`SELECT 1 FROM cliente WHERE id = $1 AND activo`, [
        e.cliente_id,
      ]);
      if (f.length === 0) errores['cliente_id'] = ['No existe o está inactivo'];
    }
    if (e.categoria_id) {
      const f: unknown[] = await tx.query(`SELECT 1 FROM categoria WHERE id = $1 AND activo`, [
        e.categoria_id,
      ]);
      if (f.length === 0) errores['categoria_id'] = ['No existe o está inactiva'];
    }
    if (Object.keys(errores).length > 0) throw errorValidacion(errores);

    const antes = await valoresRastreados(tx, id);
    const sets: string[] = ['actualizado_en = now()'];
    const valores: unknown[] = [id];
    for (const col of COLUMNAS_EDITABLES) {
      const v = e[col];
      if (v === undefined) continue;
      valores.push(v);
      sets.push(`${col} = $${valores.length}`);
    }
    await tx.query(`UPDATE ticket SET ${sets.join(', ')} WHERE id = $1`, valores);
    const despues = await valoresRastreados(tx, id);

    await registrarCambios(tx, {
      entidad: 'ticket',
      entidad_id: id,
      actor,
      antes: { ...antes },
      despues: { ...despues },
      campos: [...CAMPOS_RASTREADOS],
      etiquetas: ETIQUETAS_CAMBIO,
    });
    return cargarTicket(tx, id);
  });
}

// ---- Cambiar estado (spec §5.4, ADR 0004) ----

export async function cambiarEstado(
  actor: UsuarioSesion,
  id: number,
  p: CambioEstadoTicketDatos,
): Promise<TicketSalidaDatos> {
  return enTransaccion(async (tx) => {
    const t = await bloquearTicket(tx, id);
    if (!puedeTransicionar(t.estado, p.estado)) {
      throw new ErrorApp('TRANSICION_INVALIDA', 'Ese cambio de estado no está permitido', {
        desde: t.estado,
        hasta: p.estado,
        permitidas: transicionesDesde(t.estado),
      });
    }

    if (p.estado === 'resuelto') {
      const abiertas = await otsAbiertas(tx, id);
      if (abiertas.length > 0) {
        throw new ErrorApp('OT_ABIERTA', 'El ticket tiene OT abiertas', { ots: abiertas });
      }
    }

    let duplicado_de_id: number | null = null;
    let duplicado_de_codigo: string | null = null;
    if (p.estado === 'duplicado') {
      const [original]: { id: number; codigo: string; estado: EstadoTicket }[] = await tx.query(
        `SELECT id, codigo, estado FROM ticket WHERE id = $1`,
        [p.duplicado_de_id],
      );
      const mensaje = !original
        ? 'El ticket original no existe'
        : original.id === id
          ? 'Un ticket no puede ser duplicado de sí mismo'
          : original.estado === 'duplicado'
            ? 'El ticket original ya está marcado como duplicado'
            : null;
      if (mensaje !== null || !original) {
        throw errorValidacion({ duplicado_de_id: [mensaje ?? 'El ticket original no existe'] });
      }
      duplicado_de_id = original.id;
      duplicado_de_codigo = original.codigo;
    }

    const espera_de = p.estado === 'en_espera' ? p.espera_de : null;
    const espera_detalle = p.estado === 'en_espera' ? (p.espera_detalle ?? null) : null;
    const motivo_cierre =
      p.estado === 'descartado'
        ? p.motivo
        : p.estado === 'duplicado'
          ? `Duplicado de ${duplicado_de_codigo}`
          : null;
    const cierra = esCerrado(p.estado);

    await tx.query(
      `UPDATE ticket
          SET estado = $2, espera_de = $3, espera_detalle = $4, motivo_cierre = $5, duplicado_de_id = $6,
              cerrado_en = CASE WHEN $7::boolean THEN COALESCE(cerrado_en, now()) ELSE NULL END,
              archivado_en = CASE WHEN $7::boolean THEN archivado_en ELSE NULL END,
              primera_respuesta_en = CASE WHEN $2 = 'en_curso' THEN COALESCE(primera_respuesta_en, now())
                                          ELSE primera_respuesta_en END,
              actualizado_en = now()
        WHERE id = $1`,
      [id, p.estado, espera_de, espera_detalle, motivo_cierre, duplicado_de_id, cierra],
    );

    const datos =
      p.estado === 'en_espera'
        ? { espera_de: p.espera_de, espera_detalle }
        : p.estado === 'descartado'
          ? { motivo: p.motivo }
          : p.estado === 'duplicado'
            ? { duplicado_de_id, duplicado_de_codigo }
            : null;
    await registrarEvento(tx, {
      entidad: 'ticket',
      entidad_id: id,
      actor,
      accion: 'cambio',
      campo: 'estado',
      valor_anterior: ETIQUETA_ESTADO_TICKET[t.estado],
      valor_nuevo: ETIQUETA_ESTADO_TICKET[p.estado],
      datos,
    });
    return cargarTicket(tx, id);
  });
}

// ---- Responsables y seguidores ----

const unicos = (ids: number[]): number[] => [...new Set(ids)];
const nombresOrdenados = (ids: number[], nombres: Map<number, string>): string | null =>
  ids.length === 0
    ? null
    : ids
        .map((i) => nombres.get(i) ?? '')
        .sort((a, b) => a.localeCompare(b, 'es'))
        .join(', ');

async function leerEquipo(
  tx: EntityManager,
  id: number,
): Promise<{ principal: number | null; otros: number[] }> {
  const filas: { usuario_id: number; principal: boolean }[] = await tx.query(
    `SELECT usuario_id, principal FROM ticket_responsable WHERE ticket_id = $1`,
    [id],
  );
  return {
    principal: filas.find((f) => f.principal)?.usuario_id ?? null,
    otros: filas.filter((f) => !f.principal).map((f) => f.usuario_id),
  };
}

// Reemplaza el conjunto. B7: no recalcula fechas.
export async function guardarResponsables(
  actor: UsuarioSesion,
  id: number,
  e: ResponsablesEntradaDatos,
): Promise<TicketSalidaDatos> {
  return enTransaccion(async (tx) => {
    const t = await bloquearTicket(tx, id);
    if (t.cerrado_en !== null) throw ticketCerrado();

    const otros = unicos(e.otros_ids).filter((i) => i !== e.principal_id);
    const errores: Record<string, string[]> = {};
    if (e.principal_id !== null && (await usuariosNoValidos(tx, [e.principal_id])).length > 0) {
      errores['principal_id'] = ['No existe o está inactivo'];
    }
    if ((await usuariosNoValidos(tx, otros)).length > 0) {
      errores['otros_ids'] = ['Hay usuarios que no existen o están inactivos'];
    }
    if (Object.keys(errores).length > 0) throw errorValidacion(errores);

    const antes = await leerEquipo(tx, id);
    await tx.query(`DELETE FROM ticket_responsable WHERE ticket_id = $1`, [id]);
    if (e.principal_id !== null) {
      await tx.query(
        `INSERT INTO ticket_responsable (ticket_id, usuario_id, principal) VALUES ($1, $2, true)`,
        [id, e.principal_id],
      );
    }
    for (const usuario_id of otros) {
      await tx.query(
        `INSERT INTO ticket_responsable (ticket_id, usuario_id, principal) VALUES ($1, $2, false)`,
        [id, usuario_id],
      );
    }
    await tx.query(`UPDATE ticket SET actualizado_en = now() WHERE id = $1`, [id]);

    const nombres = await nombresUsuarios(tx, [
      ...[antes.principal, e.principal_id].filter((i): i is number => i !== null),
      ...antes.otros,
      ...otros,
    ]);
    const nombrePrincipal = (i: number | null): string | null =>
      i === null ? null : (nombres.get(i) ?? null);
    await registrarCambios(tx, {
      entidad: 'ticket',
      entidad_id: id,
      actor,
      antes: {
        responsable_principal: nombrePrincipal(antes.principal),
        responsables: nombresOrdenados(antes.otros, nombres),
      },
      despues: {
        responsable_principal: nombrePrincipal(e.principal_id),
        responsables: nombresOrdenados(otros, nombres),
      },
      campos: ['responsable_principal', 'responsables'],
    });
    return cargarTicket(tx, id);
  });
}

// Permitido en tickets cerrados.
export async function guardarSeguidores(
  actor: UsuarioSesion,
  id: number,
  e: SeguidoresEntradaDatos,
): Promise<TicketSalidaDatos> {
  return enTransaccion(async (tx) => {
    await bloquearTicket(tx, id);
    const ids = unicos(e.usuario_ids);
    if ((await usuariosNoValidos(tx, ids)).length > 0) {
      throw errorValidacion({ usuario_ids: ['Hay usuarios que no existen o están inactivos'] });
    }
    const previos: { usuario_id: number }[] = await tx.query(
      `SELECT usuario_id FROM ticket_seguidor WHERE ticket_id = $1`,
      [id],
    );
    await tx.query(`DELETE FROM ticket_seguidor WHERE ticket_id = $1`, [id]);
    for (const usuario_id of ids) {
      await tx.query(`INSERT INTO ticket_seguidor (ticket_id, usuario_id) VALUES ($1, $2)`, [
        id,
        usuario_id,
      ]);
    }
    await tx.query(`UPDATE ticket SET actualizado_en = now() WHERE id = $1`, [id]);

    const antesIds = previos.map((p) => p.usuario_id);
    const nombres = await nombresUsuarios(tx, [...antesIds, ...ids]);
    await registrarCambios(tx, {
      entidad: 'ticket',
      entidad_id: id,
      actor,
      antes: { seguidores: nombresOrdenados(antesIds, nombres) },
      despues: { seguidores: nombresOrdenados(ids, nombres) },
      campos: ['seguidores'],
    });
    return cargarTicket(tx, id);
  });
}

// ---- Para los módulos de actividad (mensajes y tareas escriben el ticket solo por aquí) ----

export { bloquearTicket };

// Un mensaje o una tarea tocan el ticket: `actualizado_en` y, con `respuesta`, la primera respuesta (§6.1).
export async function registrarActividadEnTicket(
  tx: EntityManager,
  id: number,
  opciones: { respuesta?: boolean } = {},
): Promise<void> {
  await tx.query(
    `UPDATE ticket
        SET actualizado_en = now(),
            primera_respuesta_en = CASE WHEN $2::boolean THEN COALESCE(primera_respuesta_en, now())
                                        ELSE primera_respuesta_en END
      WHERE id = $1`,
    [id, opciones.respuesta === true],
  );
}
