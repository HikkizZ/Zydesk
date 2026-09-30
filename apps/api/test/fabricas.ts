import { ESTADOS_TICKET_CERRADOS, type EstadoTicket } from '@zydesk/shared';
import argon2 from 'argon2';
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { dataSource } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Archivo } from '../src/modulos/archivos/archivo.entity.js';
import { Categoria } from '../src/modulos/categorias/categoria.entity.js';
import { Cliente } from '../src/modulos/clientes/cliente.entity.js';
import { Departamento } from '../src/modulos/departamentos/departamento.entity.js';
import { HorarioDia } from '../src/modulos/departamentos/horario-dia.entity.js';
import { versionTerminosVigente } from '../src/modulos/legal/legal.service.js';
import { Mensaje } from '../src/modulos/mensajes/mensaje.entity.js';
import { Tarea } from '../src/modulos/tareas/tarea.entity.js';
import { TicketResponsable } from '../src/modulos/tickets/ticket-responsable.entity.js';
import { Ticket } from '../src/modulos/tickets/ticket.entity.js';
import { Usuario } from '../src/modulos/usuarios/usuario.entity.js';

export const CONTRASENA_PRUEBA = 'Contrasena.Prueba.1';

let secuencia = 0;
const siguiente = (): number => ++secuencia;

// Mismos parámetros que core/auth/contrasena.ts (§5.6); el hash de la contraseña por defecto se calcula una vez.
const OPCIONES_HASH = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;
let hashPorDefecto: Promise<string> | undefined;

async function hashear(contrasena: string): Promise<string> {
  if (contrasena !== CONTRASENA_PRUEBA) return argon2.hash(contrasena, OPCIONES_HASH);
  hashPorDefecto ??= argon2.hash(contrasena, OPCIONES_HASH);
  return hashPorDefecto;
}

export async function crearUsuario(
  datos: {
    nombre?: string;
    correo?: string;
    rol?: Usuario['rol'];
    contrasena?: string;
    departamento_id?: number | null;
    activo?: boolean;
    debe_cambiar_contrasena?: boolean;
    terminos_version?: string | null;
  } = {},
): Promise<Usuario> {
  const n = siguiente();
  const terminos_version =
    datos.terminos_version === undefined ? versionTerminosVigente() : datos.terminos_version;
  return dataSource.manager.save(Usuario, {
    nombre: datos.nombre ?? `Usuario ${n}`,
    correo: datos.correo ?? `usuario${n}@zydesk.test`,
    contrasena_hash: await hashear(datos.contrasena ?? CONTRASENA_PRUEBA),
    rol: datos.rol ?? 'tecnico',
    departamento_id: datos.departamento_id ?? null,
    activo: datos.activo ?? true,
    color_avatar: '#CFDDF3',
    debe_cambiar_contrasena: datos.debe_cambiar_contrasena ?? false,
    // por defecto ya aceptó la versión vigente (para no frenar los tests con TERMINOS_PENDIENTES)
    terminos_version,
    terminos_aceptados_en: terminos_version ? new Date() : null,
  });
}

// L-V activos 08:30-18:00 con colación 13:00/60; sábado y domingo libres (0 = domingo).
export async function crearDepartamento(
  datos: { nombre?: string; capacidad_tickets_pct?: number } = {},
): Promise<Departamento> {
  const departamento = await dataSource.manager.save(Departamento, {
    nombre: datos.nombre ?? `Departamento ${siguiente()}`,
    hora_extendida_desde: '19:00',
    capacidad_tickets_pct: datos.capacidad_tickets_pct ?? 80,
  });
  for (let dia = 0; dia <= 6; dia++) {
    const laboral = dia >= 1 && dia <= 5;
    await dataSource.manager.save(HorarioDia, {
      departamento_id: departamento.id,
      dia_semana: dia,
      activo: laboral,
      entrada: laboral ? '08:30' : '09:00',
      salida: laboral ? '18:00' : '13:00',
      colacion_inicio: '13:00',
      colacion_min: laboral ? 60 : 0,
    });
  }
  return departamento;
}

export async function crearCliente(
  datos: Partial<Pick<Cliente, 'nombre' | 'rut' | 'es_interno' | 'activo'>> = {},
): Promise<Cliente> {
  return dataSource.manager.save(Cliente, {
    nombre: datos.nombre ?? `Cliente ${siguiente()}`,
    rut: datos.rut ?? null,
    es_interno: datos.es_interno ?? false,
    activo: datos.activo ?? true,
  });
}

export async function crearCategoria(
  datos: { nombre?: string; responsable_defecto_id?: number | null; activo?: boolean } = {},
): Promise<Categoria> {
  return dataSource.manager.save(Categoria, {
    nombre: datos.nombre ?? `Categoría ${siguiente()}`,
    responsable_defecto_id: datos.responsable_defecto_id ?? null,
    plazo_respuesta: { valor: 2, unidad: 'horas' },
    plazo_resolucion: {
      urgente: { valor: 4, unidad: 'horas' },
      alta: { valor: 1, unidad: 'dias' },
      media: { valor: 3, unidad: 'dias' },
      baja: { valor: 5, unidad: 'dias' },
    },
    activo: datos.activo ?? true,
  });
}

const NUMERO_TICKET_INICIAL = 5000;

// Inserta directo (no pasa por el contador de numeración): `numero` secuencial desde 5000 y
// `codigo = TK-<numero>`. Los datos que exigen los CHECK de la tabla según el estado se rellenan solos;
// `duplicado` crea el ticket original si no se indica `duplicado_de_id`.
export async function crearTicket(
  datos: {
    estado?: EstadoTicket;
    prioridad?: Ticket['prioridad'];
    cliente_id?: number | null;
    categoria_id?: number | null;
    principal_id?: number | null;
    otros_ids?: number[];
    fecha_limite?: Date | null;
    cerrado_en?: Date | null;
    archivado_en?: Date | null;
    creado_por?: number | null;
    // extras opcionales de conveniencia para los tests
    asunto?: string;
    numero?: number;
    espera_de?: Ticket['espera_de'];
    duplicado_de_id?: number | null;
    solicitante_nombre?: string | null;
    creado_en?: Date;
    actualizado_en?: Date;
  } = {},
): Promise<Ticket> {
  const estado = datos.estado ?? 'nuevo';
  const cerrado = (ESTADOS_TICKET_CERRADOS as readonly EstadoTicket[]).includes(estado);
  let duplicado_de_id = datos.duplicado_de_id ?? null;
  if (estado === 'duplicado' && duplicado_de_id === null) {
    duplicado_de_id = (await crearTicket({ creado_por: datos.creado_por ?? null })).id;
  }
  let numero = datos.numero;
  if (numero === undefined) {
    const [fila]: { n: number }[] = await dataSource.query(
      `SELECT GREATEST(COALESCE(max(numero), 0), ${NUMERO_TICKET_INICIAL - 1}) + 1 AS n FROM ticket`,
    );
    numero = fila!.n;
  }
  const ticket = await dataSource.manager.save(Ticket, {
    numero,
    codigo: `TK-${numero}`,
    asunto: datos.asunto ?? `Ticket de prueba ${numero}`,
    descripcion: null,
    cliente_id: datos.cliente_id ?? null,
    solicitante_nombre: datos.solicitante_nombre ?? null,
    solicitante_correo: null,
    origen: 'externo',
    prioridad: datos.prioridad ?? 'media',
    categoria_id: datos.categoria_id ?? null,
    estado,
    espera_de: estado === 'en_espera' ? (datos.espera_de ?? 'cliente') : null,
    espera_detalle: null,
    motivo_cierre: estado === 'descartado' ? 'Descartado en prueba' : null,
    duplicado_de_id: estado === 'duplicado' ? duplicado_de_id : null,
    inicio_planificado: null,
    fecha_limite: datos.fecha_limite ?? null,
    respuesta_limite: null,
    primera_respuesta_en: null,
    horas_estimadas: null,
    creado_por: datos.creado_por ?? null,
    ...(datos.creado_en ? { creado_en: datos.creado_en } : {}),
    ...(datos.actualizado_en ? { actualizado_en: datos.actualizado_en } : {}),
    cerrado_en: cerrado ? (datos.cerrado_en ?? new Date()) : null,
    archivado_en: datos.archivado_en ?? null,
  });
  if (datos.principal_id) {
    await dataSource.manager.save(TicketResponsable, {
      ticket_id: ticket.id,
      usuario_id: datos.principal_id,
      principal: true,
    });
  }
  for (const usuario_id of datos.otros_ids ?? []) {
    await dataSource.manager.save(TicketResponsable, {
      ticket_id: ticket.id,
      usuario_id,
      principal: false,
    });
  }
  return ticket;
}

export async function crearMensaje(
  ticket_id: number,
  datos: { tipo?: Mensaje['tipo']; autor_id: number | null; texto?: string; horas?: number | null },
): Promise<Mensaje> {
  return dataSource.manager.save(Mensaje, {
    ticket_id,
    tipo: datos.tipo ?? 'seguimiento',
    autor_id: datos.autor_id,
    texto: datos.texto ?? `Mensaje de prueba ${siguiente()}`,
    horas: datos.horas ?? null,
  });
}

export async function crearTarea(
  ticket_id: number,
  datos: {
    titulo?: string;
    responsable_id?: number | null;
    fecha?: string | null;
    hecha?: boolean;
  } = {},
): Promise<Tarea> {
  const [fila]: { n: number }[] = await dataSource.query(
    `SELECT COALESCE(max(orden), 0) + 1 AS n FROM tarea WHERE ticket_id = $1`,
    [ticket_id],
  );
  const hecha = datos.hecha ?? false;
  return dataSource.manager.save(Tarea, {
    ticket_id,
    titulo: datos.titulo ?? `Tarea de prueba ${siguiente()}`,
    responsable_id: datos.responsable_id ?? null,
    fecha: datos.fecha ?? null,
    hecha,
    hecha_en: hecha ? new Date() : null,
    orden: fila!.n,
  });
}

// Directorio de archivos de los tests: TEST_ARCHIVOS_DIR o uno temporal por proceso. Mismo criterio que el
// Storage de test (spec fase-2 §3.2): cuando exista `crearStorage`, debe usar este mismo directorio.
let directorioArchivos: string | undefined;
export function directorioArchivosTest(): string {
  directorioArchivos ??=
    env.TEST_ARCHIVOS_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'zydesk-archivos-'));
  return directorioArchivos;
}

const EXTENSION_POR_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'message/rfc822': '.eml',
};

// Escribe un archivo real en el directorio de test (clave `aaaa/mm/<uuid>.<ext>`) y la fila pendiente
// (`entidad NULL`) de `subido_por`.
export async function crearArchivoPendiente(
  subido_por: number,
  datos: { nombre?: string; tipo_mime?: string; contenido?: Buffer } = {},
): Promise<Archivo> {
  const tipo_mime = datos.tipo_mime ?? 'text/plain';
  const contenido = datos.contenido ?? Buffer.from(`contenido de prueba ${siguiente()}`);
  const ext = EXTENSION_POR_MIME[tipo_mime] ?? '.bin';
  const ahora = new Date();
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0');
  const clave = `${ahora.getUTCFullYear()}/${mes}/${randomUUID()}${ext}`;
  const ruta = path.join(directorioArchivosTest(), clave);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, contenido);
  return dataSource.manager.save(Archivo, {
    entidad: null,
    entidad_id: null,
    mensaje_id: null,
    categoria: tipo_mime.startsWith('image/')
      ? 'foto'
      : tipo_mime === 'message/rfc822' || tipo_mime === 'application/vnd.ms-outlook'
        ? 'correo'
        : 'documento',
    nombre_original: datos.nombre ?? `archivo-${siguiente()}${ext}`,
    tipo_mime,
    tamano: contenido.length,
    clave,
    origen_correo_id: null,
    subido_por,
  });
}

// Contenido de `apps/api/test/fixtures/<nombre>`.
export function archivoDePrueba(nombre: string): Buffer {
  return fs.readFileSync(fileURLToPath(new URL(`./fixtures/${nombre}`, import.meta.url)));
}

// Ingresa por la API y devuelve la cookie, la cabecera CSRF y un agente de Supertest que ya las envía.
export async function ingresarComo(
  app: Express,
  usuario: Pick<Usuario, 'correo'>,
  contrasena: string = CONTRASENA_PRUEBA,
  mantener = false,
): Promise<{ cookie: string; csrf: string; agente: ReturnType<typeof request.agent> }> {
  const agente = request.agent(app).set('X-Requested-With', 'Zydesk');
  const res = await agente
    .post('/api/auth/ingresar')
    .send({ correo: usuario.correo, contrasena, mantener });
  if (res.status !== 200) throw new Error(`ingresarComo falló: ${res.status} ${res.text}`);
  const cookie = (res.headers['set-cookie'] as unknown as string[])
    .map((c) => c.split(';')[0])
    .join('; ');
  return { cookie, csrf: 'Zydesk', agente };
}
