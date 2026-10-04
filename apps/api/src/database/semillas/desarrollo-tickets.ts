import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import { formatearCodigo } from '../../core/numeracion/numeracion.js';
import { enTransaccion } from '../../core/historial/transaccion.js';

// Semillas de tickets de desarrollo (spec §13): 16 tickets de los diseños "Tablero" y "Tabla" más TK-1053
// y TK-1019 de la Fase 3 (las OT se siembran en `desarrollo-ots.ts`). Idempotentes por `codigo`. Insertan
// con `numero` explícito y al final suben el contador a 1053. Las fechas son relativas a "hoy" en Santiago.

type Estado = 'nuevo' | 'en_curso' | 'en_espera' | 'resuelto' | 'descartado' | 'duplicado';
type EsperaDe = 'cliente' | 'proveedor' | 'repuesto' | 'aprobacion';
type Prioridad = 'urgente' | 'alta' | 'media' | 'baja';
type Mensaje = ['seguimiento' | 'nota_interna', string, string];

interface TicketSemilla {
  numero: number;
  asunto: string;
  cliente: string | null;
  estado: Estado;
  espera?: { de: EsperaDe; detalle?: string };
  prioridad: Prioridad;
  responsables: string[]; // usuario; el primero es el principal
  vence: number; // días desde hoy
  categoria: string;
  creado: number; // días atrás
  cerrado?: number; // días atrás
  archivado?: number; // días atrás
  motivo?: string;
  duplicado_de?: number;
  horas_estimadas?: number; // estimación del ticket (carga del reporte; spec fase 7 §10.1)
  correo?: boolean;
  mensajes: Mensaje[];
  tareas?: [titulo: string, responsable: string][]; // abiertas, sin fecha
}

const ETIQUETA_ESTADO: Record<Estado, string> = {
  nuevo: 'Nuevo',
  en_curso: 'En curso',
  en_espera: 'En espera',
  resuelto: 'Resuelto',
  descartado: 'Descartado',
  duplicado: 'Duplicado',
};

// prettier-ignore
const TICKETS: TicketSemilla[] = [
  { numero: 1019, asunto: 'Mantención preventiva trimestral', cliente: 'Clínica Los Robles', estado: 'resuelto', prioridad: 'media', responsables: ['imorales'], vence: -1, categoria: 'Hardware y equipos', creado: 10, cerrado: 1, mensajes: [] },
  { numero: 1012, asunto: 'Cableado estructurado oficina Temuco', cliente: 'Transportes Austral', estado: 'resuelto', prioridad: 'media', responsables: ['treyes'], vence: -20, categoria: 'Redes y VPN', creado: 28, cerrado: 20, archivado: 13, mensajes: [['seguimiento', 'treyes', 'Cableado terminado y certificado en los 14 puntos.']] },
  { numero: 1024, asunto: 'Restablecer acceso a portal de proveedores', cliente: 'Clínica Los Robles', estado: 'resuelto', prioridad: 'alta', responsables: ['imorales', 'jperez'], vence: -2, categoria: 'Accesos y usuarios', creado: 6, cerrado: 2, correo: true, mensajes: [['seguimiento', 'imorales', 'Se restableció la contraseña y se verificó el ingreso con el usuario.'], ['nota_interna', 'jperez', 'El portal bloquea tras 3 intentos; avisar al cliente.']] },
  { numero: 1026, asunto: 'Impresora del piso 3 atasca papel', cliente: 'Oficina central', estado: 'resuelto', prioridad: 'media', responsables: ['sdiaz'], vence: -2, categoria: 'Hardware y equipos', creado: 5, cerrado: 1, mensajes: [['seguimiento', 'sdiaz', 'Se limpió el rodillo de arrastre y se cambió la bandeja.']] },
  { numero: 1028, asunto: 'Revisión de cámaras de seguridad acceso norte', cliente: 'Viña Santa Clara', estado: 'en_espera', espera: { de: 'repuesto', detalle: 'Fuente de poder del DVR' }, prioridad: 'alta', responsables: ['treyes'], vence: 7, categoria: 'Seguridad y cámaras', creado: 7, correo: true, horas_estimadas: 6, mensajes: [['seguimiento', 'treyes', 'Dos cámaras sin señal; se pidió la fuente de poder del DVR.'], ['nota_interna', 'treyes', 'Llega en 5 días hábiles según el proveedor.']] },
  { numero: 1030, asunto: 'Licencias de software de diseño por renovar', cliente: 'Marketing', estado: 'en_espera', espera: { de: 'proveedor', detalle: 'Cotización de renovación' }, prioridad: 'baja', responsables: ['nvega'], vence: 9, categoria: 'Accesos y usuarios', creado: 9, horas_estimadas: 2, mensajes: [] },
  { numero: 1033, asunto: 'Renovación de plataforma de respaldo', cliente: 'Constructora Andes', estado: 'en_espera', espera: { de: 'aprobacion', detalle: 'Aprobación del cliente' }, prioridad: 'media', responsables: ['fcastro'], vence: 6, categoria: 'Hardware y equipos', creado: 8, horas_estimadas: 3, mensajes: [['seguimiento', 'fcastro', 'Se envió la propuesta de renovación; esperamos la aprobación.']] },
  { numero: 1035, asunto: 'Configurar respaldo semanal en NAS', cliente: 'Clínica Los Robles', estado: 'en_curso', prioridad: 'media', responsables: ['imorales'], vence: 6, categoria: 'Hardware y equipos', creado: 6, horas_estimadas: 4, mensajes: [['seguimiento', 'imorales', 'NAS configurado; falta programar la tarea del domingo.'], ['nota_interna', 'imorales', 'Verificar espacio disponible antes de activar la retención.']] },
  { numero: 1037, asunto: 'Reemplazo de switch en bodega central', cliente: 'Operaciones', estado: 'en_curso', prioridad: 'media', responsables: ['vsoto'], vence: 1, categoria: 'Redes y VPN', creado: 4, mensajes: [['seguimiento', 'vsoto', 'Switch nuevo en sitio; el cambio se hará fuera de horario.']] },
  { numero: 1040, asunto: 'Caída intermitente de VPN para equipo en terreno', cliente: 'Transportes Austral', estado: 'en_curso', prioridad: 'urgente', responsables: ['dmunoz', 'treyes'], vence: 0, categoria: 'Redes y VPN', creado: 3, correo: true, horas_estimadas: 4, mensajes: [['seguimiento', 'dmunoz', 'Reproduje la caída: el túnel se reinicia cada 30 minutos.'], ['nota_interna', 'treyes', 'Posible problema con la renegociación de claves del router.'], ['seguimiento', 'dmunoz', 'Se ajustó el tiempo de vida de la clave; monitoreando.'], ['nota_interna', 'dmunoz', 'Si persiste, cambiar el router de la bodega.']] },
  { numero: 1042, asunto: 'Migración de correo a nuevo dominio', cliente: 'Constructora Andes', estado: 'en_curso', prioridad: 'alta', responsables: ['crojas', 'mfuentes'], vence: 3, categoria: 'Correo', creado: 5, mensajes: [['seguimiento', 'crojas', 'Dominio nuevo validado; empezamos por los buzones de gerencia.'], ['nota_interna', 'mfuentes', 'Hay 3 alias que hay que recrear a mano.'], ['seguimiento', 'mfuentes', 'Migrados 12 de 30 buzones.']] },
  { numero: 1044, asunto: 'VPN no conecta desde bodega', cliente: 'Transportes Austral', estado: 'duplicado', duplicado_de: 1040, prioridad: 'media', responsables: ['dmunoz'], vence: -3, categoria: 'Redes y VPN', creado: 4, cerrado: 3, mensajes: [] },
  { numero: 1047, asunto: 'Oferta de proveedor reenviada al soporte', cliente: null, estado: 'descartado', motivo: 'No corresponde: publicidad de proveedor', prioridad: 'baja', responsables: ['jperez'], vence: -1, categoria: 'Correo', creado: 3, cerrado: 1, correo: true, mensajes: [] },
  { numero: 1048, asunto: 'Error al emitir facturas desde el ERP', cliente: 'Viña Santa Clara', estado: 'en_curso', prioridad: 'alta', responsables: ['sdiaz', 'crojas'], vence: 0, categoria: 'ERP / Facturación', creado: 2, correo: true, mensajes: [] },
  { numero: 1049, asunto: 'Alta de usuario para nueva contadora', cliente: 'Administración y Finanzas', estado: 'nuevo', prioridad: 'baja', responsables: ['jperez'], vence: 5, categoria: 'Accesos y usuarios', creado: 2, horas_estimadas: 1, mensajes: [] },
  { numero: 1050, asunto: 'Solicitud de cotización: mantención preventiva de 12 equipos', cliente: 'Clínica Los Robles', estado: 'nuevo', prioridad: 'media', responsables: [], vence: 2, categoria: 'Hardware y equipos', creado: 1, correo: true, mensajes: [] },
  { numero: 1051, asunto: 'Servidor de archivos no responde en sucursal Temuco', cliente: 'Transportes Austral', estado: 'nuevo', prioridad: 'urgente', responsables: ['dmunoz'], vence: 0, categoria: 'Redes y VPN', creado: 0, correo: true, horas_estimadas: 3, mensajes: [], tareas: [['Revisar el estado del servidor de archivos en la sucursal', 'dmunoz']] },
  { numero: 1053, asunto: 'Reemplazo de UPS en sala de servidores', cliente: 'Operaciones', estado: 'en_curso', prioridad: 'media', responsables: ['vsoto'], vence: 4, categoria: 'Hardware y equipos', creado: 2, mensajes: [] },
];

// TK-1048 reproduce la pantalla "Ticket TK-1048" (sin los eventos de OT/COT). `dia` = días atrás.
// prettier-ignore
const TAREAS_1048: { titulo: string; quien: string; dia: number; hecha: boolean }[] = [
  { titulo: 'Revisar log del ERP y confirmar la causa', quien: 'sdiaz', dia: 2, hecha: true },
  { titulo: 'Solicitar nuevo rango de folios (CAF)', quien: 'sdiaz', dia: 1, hecha: true },
  { titulo: 'Cargar CAF y probar emisión en QA', quien: 'sdiaz', dia: 1, hecha: false },
  { titulo: 'Pasar a producción y acompañar la primera emisión', quien: 'crojas', dia: 0, hecha: false },
  { titulo: 'Confirmar con Fernanda si se descuenta de la bolsa de horas', quien: 'crojas', dia: 0, hecha: false },
];

export type Tx = Pick<EntityManager, 'query'>;

export async function instante(tx: Tx, dias: number, hora: string): Promise<Date> {
  const [{ t }] = await tx.query(
    `SELECT (((now() AT TIME ZONE 'America/Santiago')::date - $1::int + $2::time) AT TIME ZONE 'America/Santiago') AS t`,
    [dias, hora],
  );
  return t as Date;
}

export async function fechaRelativa(tx: Tx, dias: number): Promise<string> {
  const [{ f }] = await tx.query(
    `SELECT to_char((now() AT TIME ZONE 'America/Santiago')::date - $1::int, 'YYYY-MM-DD') AS f`,
    [dias],
  );
  return f as string;
}

async function evento(
  tx: Tx,
  ticket_id: number,
  autor: number,
  creado_en: Date,
  accion: string,
  extra: {
    campo?: string;
    anterior?: string;
    nuevo?: string;
    datos?: unknown;
  } = {},
): Promise<void> {
  await tx.query(
    `INSERT INTO evento (entidad, entidad_id, autor_id, accion, campo, valor_anterior, valor_nuevo, datos, creado_en)
     VALUES ('ticket', $1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      String(ticket_id),
      autor,
      accion,
      extra.campo ?? null,
      extra.anterior ?? null,
      extra.nuevo ?? null,
      extra.datos === undefined ? null : JSON.stringify(extra.datos),
      creado_en,
    ],
  );
}

async function mensaje(
  tx: Tx,
  ticket_id: number,
  tipo: Mensaje[0],
  autor: number,
  texto: string,
  creado_en: Date,
  mencionados: number[] = [],
): Promise<number> {
  const [{ id }] = await tx.query(
    `INSERT INTO mensaje (ticket_id, tipo, autor_id, texto, creado_en) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [ticket_id, tipo, autor, texto, creado_en],
  );
  for (const usuario_id of mencionados) {
    await tx.query(`INSERT INTO mencion (mensaje_id, usuario_id) VALUES ($1, $2)`, [
      id,
      usuario_id,
    ]);
  }
  return id as number;
}

async function registroHoras(
  tx: Tx,
  usuario_id: number,
  ticket_id: number,
  mensaje_id: number,
  horas: number,
  cuando: Date,
  fecha: string,
): Promise<void> {
  await tx.query(
    `INSERT INTO registro_horas (usuario_id, fecha, ticket_id, mensaje_id, horas, creado_en, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    [usuario_id, fecha, ticket_id, mensaje_id, horas, cuando],
  );
}

async function sembrarTicket(
  t: TicketSemilla,
  ctx: {
    prefijo: string;
    digitos: number;
    personas: Map<string, number>;
    clientes: Map<string, number>;
    categorias: Map<string, number>;
  },
): Promise<void> {
  const codigo = formatearCodigo(ctx.prefijo, t.numero, ctx.digitos);
  const existe: unknown[] = await dataSource.query(`SELECT 1 FROM ticket WHERE codigo = $1`, [
    codigo,
  ]);
  if (existe.length > 0) return;

  const p = (u: string) => ctx.personas.get(u)!;
  const camila = p('crojas');
  const esInterno =
    t.cliente !== null &&
    ['Operaciones', 'Administración y Finanzas', 'Marketing', 'Oficina central'].includes(
      t.cliente,
    );

  await enTransaccion(async (tx) => {
    const creado_en = await instante(tx, t.creado, '09:00');
    const cerrado_en = t.cerrado === undefined ? null : await instante(tx, t.cerrado, '16:00');
    const archivado_en =
      t.archivado === undefined ? null : await instante(tx, t.archivado, '03:00');
    const hayRespuesta = t.estado !== 'nuevo' || t.mensajes.some((m) => m[0] === 'seguimiento');
    let duplicado_de_id: number | null = null;
    let motivo = t.motivo ?? null;
    if (t.duplicado_de !== undefined) {
      const original = formatearCodigo(ctx.prefijo, t.duplicado_de, ctx.digitos);
      const [o] = await tx.query(`SELECT id FROM ticket WHERE codigo = $1`, [original]);
      duplicado_de_id = o.id;
      motivo = `Duplicado de ${original}`;
    }
    // Vence a las 23:00 del día indicado (así "hoy" no figura vencido durante la jornada).
    const fecha_limite = await instante(tx, -t.vence, '23:00');
    const [{ id }] = await tx.query(
      `INSERT INTO ticket (numero, codigo, asunto, descripcion, cliente_id, solicitante_nombre, solicitante_correo,
                           origen, prioridad, categoria_id, estado, espera_de, espera_detalle, motivo_cierre,
                           duplicado_de_id, fecha_limite, primera_respuesta_en, horas_estimadas, creado_por,
                           creado_en, actualizado_en, cerrado_en, archivado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20, $21, $22)
       RETURNING id`,
      [
        t.numero,
        codigo,
        t.asunto,
        t.correo ? 'Ticket creado a partir de un correo recibido.' : null,
        t.cliente === null ? null : ctx.clientes.get(t.cliente),
        t.correo ? 'Solicitante de ejemplo' : null,
        t.correo ? `solicitante${t.numero}@ejemplo.test` : null,
        esInterno ? 'interno' : 'externo',
        t.prioridad,
        ctx.categorias.get(t.categoria),
        t.estado,
        t.espera?.de ?? null,
        t.espera?.detalle ?? null,
        motivo,
        duplicado_de_id,
        fecha_limite,
        hayRespuesta ? new Date(creado_en.getTime() + 3_600_000) : null,
        t.horas_estimadas ?? null,
        camila,
        creado_en,
        cerrado_en,
        archivado_en,
      ],
    );
    for (const [i, u] of t.responsables.entries()) {
      await tx.query(
        `INSERT INTO ticket_responsable (ticket_id, usuario_id, principal) VALUES ($1, $2, $3)`,
        [id, p(u), i === 0],
      );
    }
    for (const [i, [titulo, quien]] of (t.tareas ?? []).entries()) {
      await tx.query(
        `INSERT INTO tarea (ticket_id, titulo, responsable_id, hecha, orden, creado_por)
         VALUES ($1, $2, $3, false, $4, $5)`,
        [id, titulo, p(quien), i + 1, camila],
      );
    }
    if (t.correo) {
      await tx.query(
        `INSERT INTO correo_adjunto (ticket_id, archivo_id, origen, de, para, fecha, asunto, cuerpo)
         VALUES ($1, NULL, 'texto', $2, 'soporte@zydesk.local', $3, $4, $5)`,
        [
          id,
          `Solicitante de ejemplo <solicitante${t.numero}@ejemplo.test>`,
          creado_en,
          t.asunto,
          'Hola, les escribo por este tema. Quedo atento a su respuesta.',
        ],
      );
    }

    await evento(tx, id, camila, creado_en, 'creado', {
      datos: { desde_correo: t.correo === true, adjuntos_extraidos: 0, codigo },
    });
    if (t.numero !== 1048) {
      const autor = p(t.responsables[0] ?? 'crojas');
      const cuando = new Date(creado_en.getTime() + 1_800_000);
      if (t.estado === 'en_curso') {
        await evento(tx, id, autor, cuando, 'cambio', {
          campo: 'estado',
          anterior: 'Nuevo',
          nuevo: ETIQUETA_ESTADO.en_curso,
        });
      } else if (t.estado === 'en_espera' && t.espera) {
        await evento(tx, id, autor, cuando, 'cambio', {
          campo: 'estado',
          anterior: 'Nuevo',
          nuevo: ETIQUETA_ESTADO.en_espera,
          datos: { espera_de: t.espera.de, espera_detalle: t.espera.detalle ?? null },
        });
      } else if (cerrado_en) {
        await evento(tx, id, autor, cerrado_en, 'cambio', {
          campo: 'estado',
          anterior: 'En curso',
          nuevo: ETIQUETA_ESTADO[t.estado],
          datos:
            t.estado === 'descartado'
              ? { motivo }
              : t.estado === 'duplicado'
                ? { duplicado_de_codigo: motivo?.replace('Duplicado de ', '') }
                : {},
        });
      }
      if (archivado_en) await evento(tx, id, camila, archivado_en, 'archivado');
      for (const [i, [tipo, quien, texto]] of t.mensajes.entries()) {
        await mensaje(
          tx,
          id,
          tipo,
          p(quien),
          texto,
          new Date(creado_en.getTime() + (i + 2) * 3_600_000),
        );
      }
    } else {
      await sembrar1048(tx, id, p);
    }
  });
}

async function sembrar1048(tx: Tx, id: number, p: (u: string) => number): Promise<void> {
  const sd = p('sdiaz');
  const cr = p('crojas');
  for (const [i, t] of TAREAS_1048.entries()) {
    await tx.query(
      `INSERT INTO tarea (ticket_id, titulo, responsable_id, fecha, hecha, hecha_en, orden, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        t.titulo,
        p(t.quien),
        await fechaRelativa(tx, t.dia),
        t.hecha,
        t.hecha ? await instante(tx, t.dia, '12:00') : null,
        i + 1,
        cr,
      ],
    );
  }

  await mensaje(
    tx,
    id,
    'seguimiento',
    sd,
    'Recibido. Revisé el log del ERP: se agotó el rango de folios autorizados. Hay que solicitar un nuevo CAF y cargarlo en el sistema.',
    await instante(tx, 2, '17:05'),
  );
  await evento(tx, id, sd, await instante(tx, 2, '17:06'), 'cambio', {
    campo: 'estado',
    anterior: 'Nuevo',
    nuevo: 'En curso',
  });
  await mensaje(
    tx,
    id,
    'nota_interna',
    cr,
    'Ojo: Viña Santa Clara tiene contrato de soporte por horas, esto se factura. @Sebastián registra tus horas.',
    await instante(tx, 2, '17:20'),
    [sd],
  );
  await evento(tx, id, cr, await instante(tx, 2, '17:21'), 'cambio', {
    campo: 'prioridad',
    anterior: 'Media',
    nuevo: 'Alta',
  });
  await evento(tx, id, cr, await instante(tx, 2, '17:21'), 'cambio', {
    campo: 'responsables',
    anterior: 'Sebastián Díaz',
    nuevo: 'Sebastián Díaz, Camila Rojas',
  });
  await evento(tx, id, cr, await instante(tx, 2, '17:22'), 'cambio', {
    campo: 'fecha_limite',
    anterior: await fechaRelativa(tx, -2),
    nuevo: await fechaRelativa(tx, 0),
  });
  await mensaje(
    tx,
    id,
    'seguimiento',
    sd,
    'Paula, ya cargamos el nuevo CAF en el ambiente de pruebas y la emisión funciona. Hoy a las 15:00 lo pasamos a producción; te confirmamos por aquí.',
    await instante(tx, 1, '09:30'),
  );
  const cuando = await instante(tx, 1, '09:34');
  const nota = await mensaje(
    tx,
    id,
    'nota_interna',
    sd,
    'Llevo 3 h de diagnóstico y 1 h de pruebas. Falta el paso a producción, calculo unas 2 h.',
    cuando,
  );
  // Viernes de la semana anterior (lunesDe(hoy) − 3 días): así estas horas no entran en la planilla de la
  // semana actual de sdiaz, que reproduce el diseño (spec fase 5 §10).
  const [{ f: fecha }] = await tx.query(
    `SELECT to_char(date_trunc('week', now() AT TIME ZONE 'America/Santiago')::date - 3, 'YYYY-MM-DD') AS f`,
  );
  await registroHoras(tx, sd, id, nota, 3, cuando, fecha);
  await registroHoras(tx, sd, id, nota, 1, cuando, fecha);
}

// Sube el contador hasta TK-1053 (el último sembrado): el siguiente ticket es TK-1054.
export async function sembrarTickets(personas: Map<string, number>): Promise<void> {
  const [c] = await dataSource.query(
    `SELECT prefijo, digitos FROM contador WHERE clave = 'ticket'`,
  );
  const mapa = async (sql: string) =>
    new Map<string, number>(
      ((await dataSource.query(sql)) as { nombre: string; id: number }[]).map((f) => [
        f.nombre,
        f.id,
      ]),
    );
  const ctx = {
    prefijo: c.prefijo as string,
    digitos: c.digitos as number,
    personas,
    clientes: await mapa(`SELECT id, nombre FROM cliente`),
    categorias: await mapa(`SELECT id, nombre FROM categoria`),
  };
  for (const t of TICKETS) await sembrarTicket(t, ctx);
  await dataSource.query(
    `UPDATE contador SET valor = GREATEST(valor, 1053) WHERE clave = 'ticket'`,
  );
}
