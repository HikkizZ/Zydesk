import {
  ESTADOS_TICKET_CERRADOS,
  calcularCotizacion,
  type EstadoCotizacion,
  type EstadoFacturacion,
  type EstadoTicket,
  type EtapaOt,
  type Moneda,
  type TarifasSalidaDatos,
  type TipoLinea,
  type TipoOt,
  type Unidad,
  type ValidezDias,
} from '@zydesk/shared';
import argon2 from 'argon2';
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { dataSource } from '../src/config/db.js';
import { nombreCookie } from '../src/core/auth/cookie.js';
import { crearSesion } from '../src/core/auth/sesiones.js';
import { directorioArchivos } from '../src/integraciones/storage/storage.js';
import { Archivo } from '../src/modulos/archivos/archivo.entity.js';
import { Categoria } from '../src/modulos/categorias/categoria.entity.js';
import { Cliente } from '../src/modulos/clientes/cliente.entity.js';
import { Contacto } from '../src/modulos/clientes/contacto.entity.js';
import { PlantillaCotizacion } from '../src/modulos/configuracion/plantilla-cotizacion.entity.js';
import { PlantillaLinea } from '../src/modulos/configuracion/plantilla-linea.entity.js';
import { Cotizacion } from '../src/modulos/cotizaciones/cotizacion.entity.js';
import { LineaCotizacion } from '../src/modulos/cotizaciones/linea-cotizacion.entity.js';
import { ContratoBolsa } from '../src/modulos/clientes/contrato-bolsa.entity.js';
import { Departamento } from '../src/modulos/departamentos/departamento.entity.js';
import { HorarioDia } from '../src/modulos/departamentos/horario-dia.entity.js';
import { versionTerminosVigente } from '../src/modulos/legal/legal.service.js';
import { Mensaje } from '../src/modulos/mensajes/mensaje.entity.js';
import { Ot } from '../src/modulos/ots/ot.entity.js';
import { Tarea } from '../src/modulos/tareas/tarea.entity.js';
import { TicketResponsable } from '../src/modulos/tickets/ticket-responsable.entity.js';
import { Ticket } from '../src/modulos/tickets/ticket.entity.js';
import { Usuario } from '../src/modulos/usuarios/usuario.entity.js';

export const CONTRASENA_PRUEBA = 'Contrasena.Prueba.1';

let secuencia = 0;
const siguiente = (): number => ++secuencia;

// Mismos parámetros que core/auth/contrasena.ts (§5.6). Otras contraseñas se hashean al vuelo.
const OPCIONES_HASH = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

// argon2id de CONTRASENA_PRUEBA con los parámetros de producción, generado una vez (evita ~300 ms por archivo).
// Si cambia la contraseña o la constante, falla el test de fabricas.test.ts que la verifica.
export const HASH_CONTRASENA_PRUEBA =
  '$argon2id$v=19$m=65536,p=1,t=3$gGfAP7vtYzeAzjID0Bwxfw$d67kReflrb9iLL7bYXopRHtdRR4cTOpH29OPSNf6gWY';

async function hashear(contrasena: string): Promise<string> {
  if (contrasena === CONTRASENA_PRUEBA) return HASH_CONTRASENA_PRUEBA;
  return argon2.hash(contrasena, OPCIONES_HASH);
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
  destino: number | { ot_id: number },
  datos: { tipo?: Mensaje['tipo']; autor_id: number | null; texto?: string; horas?: number | null },
): Promise<Mensaje> {
  return dataSource.manager.save(Mensaje, {
    ticket_id: typeof destino === 'number' ? destino : null,
    ot_id: typeof destino === 'number' ? null : destino.ot_id,
    copiado_desde_id: null,
    tipo: datos.tipo ?? 'seguimiento',
    autor_id: datos.autor_id,
    texto: datos.texto ?? `Mensaje de prueba ${siguiente()}`,
    horas: datos.horas ?? null,
  });
}

// `destino` numérico = ticket (como antes); `{ ot_id }` = tarea de OT. Las horas solo valen en tareas de OT.
export async function crearTarea(
  destino: number | { ot_id: number },
  datos: {
    titulo?: string;
    responsable_id?: number | null;
    fecha?: string | null;
    hecha?: boolean;
    horas_estimadas?: number | null;
    horas_reales?: number | null;
  } = {},
): Promise<Tarea> {
  const ticket_id = typeof destino === 'number' ? destino : null;
  const ot_id = typeof destino === 'number' ? null : destino.ot_id;
  const [fila]: { n: number }[] =
    ot_id === null
      ? await dataSource.query(
          `SELECT COALESCE(max(orden), 0) + 1 AS n FROM tarea WHERE ticket_id = $1`,
          [ticket_id],
        )
      : await dataSource.query(
          `SELECT COALESCE(max(orden), 0) + 1 AS n FROM tarea WHERE ot_id = $1`,
          [ot_id],
        );
  const hecha = datos.hecha ?? false;
  return dataSource.manager.save(Tarea, {
    ticket_id,
    ot_id,
    titulo: datos.titulo ?? `Tarea de prueba ${siguiente()}`,
    responsable_id: datos.responsable_id ?? null,
    fecha: datos.fecha ?? null,
    hecha,
    hecha_en: hecha ? new Date() : null,
    horas_estimadas: datos.horas_estimadas ?? null,
    horas_reales: datos.horas_reales ?? null,
    orden: fila!.n,
  });
}

const NUMERO_OT_INICIAL = 9000;

// Inserta directo (no pasa por el contador): `numero` desde 9000 y `codigo = OT-<numero>`. Rellena lo que
// exigen los CHECK: cerrada → resumen, resolvió y cerrada_en; cancelada → motivo y cancelada_en;
// `estado_facturacion` coherente con el tipo (interna `no_aplica`; facturable `pendiente`, `por_facturar`
// si cerrada y `no_aplica` si cancelada); `facturada` rellena `n_factura` y `facturada_en`.
export async function crearOt(
  ticket_id: number,
  datos: {
    tipo?: TipoOt;
    etapa?: EtapaOt;
    titulo?: string;
    responsable_tecnico_id?: number | null;
    cliente_id?: number | null;
    aprobador_id?: number | null;
    estado_facturacion?: EstadoFacturacion;
    contrato_id?: number | null;
    resolvio_ticket?: boolean | null;
    resumen_cierre?: string | null;
    numero?: number;
  } = {},
): Promise<Ot> {
  const tipo = datos.tipo ?? 'facturable';
  const etapa = datos.etapa ?? 'borrador';
  let numero = datos.numero;
  if (numero === undefined) {
    const [fila]: { n: number }[] = await dataSource.query(
      `SELECT GREATEST(COALESCE(max(numero), 0), ${NUMERO_OT_INICIAL - 1}) + 1 AS n FROM ot`,
    );
    numero = fila!.n;
  }
  const estado_facturacion: EstadoFacturacion =
    tipo === 'interna'
      ? 'no_aplica'
      : (datos.estado_facturacion ??
        (etapa === 'cancelada' ? 'no_aplica' : etapa === 'cerrada' ? 'por_facturar' : 'pendiente'));
  const cerrada = etapa === 'cerrada';
  const cancelada = etapa === 'cancelada';
  const facturada = estado_facturacion === 'facturada';
  const ahora = new Date();
  return dataSource.manager.save(Ot, {
    numero,
    codigo: `OT-${numero}`,
    ticket_id,
    tipo,
    etapa,
    titulo: datos.titulo ?? `OT de prueba ${numero}`,
    alcance: null,
    responsable_tecnico_id: datos.responsable_tecnico_id ?? null,
    cliente_id: datos.cliente_id ?? null,
    contacto_id: null,
    inicio: null,
    termino: null,
    oc_cliente: null,
    condicion_pago: null,
    contrato_id: datos.contrato_id ?? null,
    centro_costo: null,
    area_solicitante: null,
    aprobador_id: datos.aprobador_id ?? null,
    aprobada_por: null,
    aprobada_en: null,
    estado_facturacion,
    n_factura: facturada ? `F-${numero}` : null,
    facturada_en: facturada ? ahora : null,
    facturada_por: null,
    resolvio_ticket: cerrada ? (datos.resolvio_ticket ?? true) : (datos.resolvio_ticket ?? null),
    resumen_cierre: cerrada
      ? (datos.resumen_cierre ?? 'Resumen de cierre de prueba')
      : (datos.resumen_cierre ?? null),
    cerrada_en: cerrada ? ahora : null,
    cerrada_por: null,
    motivo_cancelacion: cancelada ? 'Cancelada en prueba' : null,
    cancelada_en: cancelada ? ahora : null,
    creado_por: null,
  });
}

export async function crearContacto(
  cliente_id: number,
  datos: { nombre?: string; aprueba_cotizaciones?: boolean } = {},
): Promise<Contacto> {
  const n = siguiente();
  return dataSource.manager.save(Contacto, {
    cliente_id,
    nombre: datos.nombre ?? `Contacto ${n}`,
    area: null,
    correo: null,
    telefono: null,
    aprueba_cotizaciones: datos.aprueba_cotizaciones ?? false,
    activo: true,
  });
}

// Por defecto vigente desde 2020 y sin término (vigente hoy).
export async function crearBolsa(
  cliente_id: number,
  datos: { vigente_desde?: string; horas_mes?: number } = {},
): Promise<ContratoBolsa> {
  return dataSource.manager.save(ContratoBolsa, {
    cliente_id,
    horas_mes: datos.horas_mes ?? 20,
    vigente_desde: datos.vigente_desde ?? '2020-01-01',
    vigente_hasta: null,
    fecha_renovacion: null,
    notas: null,
  });
}

type LineaPrueba = {
  cantidad: number;
  precio_unitario: number;
  descuento_pct?: number;
  tipo?: TipoLinea;
  descripcion?: string;
  unidad?: Unidad;
};

// Inserta la cotización y sus líneas calculando los totales con `calcularCotizacion` (la misma función
// que usa la API). Por defecto: siguiente versión de la OT, borrador, CLP, IVA 19 %, 30 días, sin líneas.
export async function crearCotizacion(
  ot_id: number,
  datos: {
    version?: number;
    estado?: EstadoCotizacion;
    moneda?: Moneda;
    valor_uf?: number | null;
    aplica_iva?: boolean;
    iva_pct?: number;
    contacto_id?: number | null;
    fecha_emision?: string;
    validez_dias?: ValidezDias;
    lineas?: LineaPrueba[];
    condiciones?: string | null;
    nota_interna?: string | null;
  } = {},
): Promise<Cotizacion> {
  const ot = await dataSource.manager.findOneByOrFail(Ot, { id: ot_id });
  let version = datos.version;
  if (version === undefined) {
    const [fila]: { n: number }[] = await dataSource.query(
      `SELECT COALESCE(max(version), 0) + 1 AS n FROM cotizacion WHERE ot_id = $1`,
      [ot_id],
    );
    version = fila!.n;
  }
  const estado = datos.estado ?? 'borrador';
  const moneda = datos.moneda ?? 'CLP';
  const aplica_iva = datos.aplica_iva ?? true;
  const iva_pct = datos.iva_pct ?? 19;
  const lineas = (datos.lineas ?? []).map((l) => ({ ...l, descuento_pct: l.descuento_pct ?? 0 }));
  const calculo = calcularCotizacion(lineas, { moneda, aplica_iva, iva_pct });
  const ahora = new Date();
  const cotizacion = await dataSource.manager.save(Cotizacion, {
    ot_id,
    version,
    codigo: `COT-${ot.codigo.replace(/^\D+/, '')}`,
    estado,
    contacto_id: datos.contacto_id ?? null,
    fecha_emision: datos.fecha_emision ?? ahora.toISOString().slice(0, 10),
    validez_dias: datos.validez_dias ?? 30,
    moneda,
    valor_uf: datos.valor_uf === undefined ? (moneda === 'UF' ? 38000 : null) : datos.valor_uf,
    aplica_iva,
    iva_pct,
    condiciones: datos.condiciones ?? null,
    nota_interna: datos.nota_interna ?? null,
    subtotal: calculo.subtotal,
    descuentos: calculo.descuentos,
    neto: calculo.neto,
    iva: calculo.iva,
    total: calculo.total,
    enviada_en: estado === 'borrador' ? null : ahora,
    enviada_por: null,
    aprobada_en: estado === 'aprobada' ? ahora : null,
    rechazada_en: estado === 'rechazada' ? ahora : null,
    creado_por: null,
  });
  for (const [i, l] of lineas.entries()) {
    await dataSource.manager.save(LineaCotizacion, {
      cotizacion_id: cotizacion.id,
      orden: i + 1,
      tipo: l.tipo ?? 'mano_de_obra',
      descripcion: l.descripcion ?? `Línea ${i + 1}`,
      cantidad: l.cantidad,
      unidad: l.unidad ?? 'h',
      precio_unitario: l.precio_unitario,
      descuento_pct: l.descuento_pct,
      total: calculo.lineas[i]!,
    });
  }
  return cotizacion;
}

export async function crearPlantilla(
  datos: {
    nombre?: string;
    lineas?: {
      tipo?: TipoLinea;
      descripcion?: string;
      cantidad?: number;
      unidad?: Unidad;
      precio_unitario?: number | null;
      descuento_pct?: number;
    }[];
  } = {},
): Promise<PlantillaCotizacion> {
  const n = siguiente();
  const plantilla = await dataSource.manager.save(PlantillaCotizacion, {
    nombre: datos.nombre ?? `Plantilla ${n}`,
    descripcion: null,
    condiciones: null,
    activo: true,
  });
  for (const [i, l] of (datos.lineas ?? []).entries()) {
    await dataSource.manager.save(PlantillaLinea, {
      plantilla_id: plantilla.id,
      orden: i + 1,
      tipo: l.tipo ?? 'mano_de_obra',
      descripcion: l.descripcion ?? `Línea ${i + 1}`,
      cantidad: l.cantidad ?? 1,
      unidad: l.unidad ?? 'h',
      precio_unitario: l.precio_unitario ?? null,
      descuento_pct: l.descuento_pct ?? 0,
    });
  }
  return plantilla;
}

// Escribe la clave `tarifas` de `configuracion` fusionando con la semilla de la fábrica.
export async function fijarTarifas(parcial: Partial<TarifasSalidaDatos> = {}): Promise<void> {
  const tarifas: TarifasSalidaDatos = {
    hora_normal: 38000,
    hora_extendida: 45000,
    hora_urgencia: null,
    traslado_km: null,
    costo_interno: null,
    iva_pct: 19,
    validez_dias_defecto: 30,
    condiciones_defecto: null,
    ...parcial,
  };
  await dataSource.query(
    `INSERT INTO configuracion (clave, valor) VALUES ('tarifas', $1::jsonb)
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
    [JSON.stringify(tarifas)],
  );
}

// Directorio de archivos de los tests: el mismo que usa el Storage de la app (TEST_ARCHIVOS_DIR o uno temporal por proceso).
export function directorioArchivosTest(): string {
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

// Devuelve la cookie, la cabecera CSRF y un agente de Supertest que ya las envía. Sin `contrasena` crea
// la sesión directo en BD (sin argon2; no deja `ingreso_ok` ni actualiza `ultimo_ingreso`); con
// `contrasena` ingresa por la API real.
export async function ingresarComo(
  app: Express,
  usuario: Pick<Usuario, 'correo'> & Partial<Pick<Usuario, 'id'>>,
  contrasena?: string,
  mantener = false,
): Promise<{ cookie: string; csrf: string; agente: ReturnType<typeof request.agent> }> {
  if (contrasena === undefined) {
    const usuario_id =
      usuario.id ??
      (await dataSource.manager.findOneByOrFail(Usuario, { correo: usuario.correo })).id;
    const { token } = await crearSesion(dataSource.manager, {
      usuario_id,
      mantener,
      ip: '127.0.0.1',
      user_agent: 'vitest',
    });
    const cookie = `${nombreCookie('test')}=${token}`;
    const agente = request.agent(app).set('X-Requested-With', 'Zydesk').set('Cookie', cookie);
    return { cookie, csrf: 'Zydesk', agente };
  }
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
